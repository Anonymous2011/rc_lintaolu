import { db } from "./db";
import { checkTarget } from "./ssrf";
import { POLICIES, isPolicyName, type PolicyName, type RetryPolicy } from "./policy";
import type { NotificationRow } from "./types";

const METHODS = new Set(["POST", "PUT", "PATCH", "DELETE", "GET"]);

export interface EnqueueInput {
  source?: unknown;
  event_type?: unknown;
  target_url?: unknown;
  method?: unknown;
  headers?: unknown;
  body?: unknown;
  policy?: unknown;
  /** Console-only escape hatch; see POLICIES for why callers normally can't. */
  policy_overrides?: unknown;
  idempotency_key?: unknown;
}

export type EnqueueResult =
  | { ok: true; id: string; duplicate: boolean; status: NotificationRow["status"] }
  | { ok: false; error: string; field?: string };

function id(): string {
  // Time-prefixed so ids sort roughly by creation, with random suffix for
  // uniqueness. Not a ULID — we do not need cross-process monotonicity.
  return `ntf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function clampOverrides(base: RetryPolicy, raw: unknown): RetryPolicy {
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const num = (key: keyof RetryPolicy, min: number, max: number): number => {
    const v = o[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return base[key];
    return Math.min(max, Math.max(min, v));
  };
  // Bounds exist so an override cannot turn into a self-inflicted outage:
  // 500 attempts at 10ms against a struggling vendor is an attack, not a retry.
  return {
    maxAttempts: Math.round(num("maxAttempts", 1, 20)),
    baseDelayMs: Math.round(num("baseDelayMs", 100, 3_600_000)),
    factor: num("factor", 1, 10),
    maxDelayMs: Math.round(num("maxDelayMs", 100, 86_400_000)),
    timeoutMs: Math.round(num("timeoutMs", 500, 60_000)),
  };
}

const insert = db.prepare(`
  INSERT INTO notifications (
    id, idempotency_key, source, event_type, target_url, method, headers, body,
    status, attempt_count, next_attempt_at, lease_expires_at,
    policy_name, max_attempts, base_delay_ms, backoff_factor, max_delay_ms, timeout_ms,
    created_at, updated_at
  ) VALUES (
    @id, @idempotency_key, @source, @event_type, @target_url, @method, @headers, @body,
    'pending', 0, @now, NULL,
    @policy_name, @max_attempts, @base_delay_ms, @backoff_factor, @max_delay_ms, @timeout_ms,
    @now, @now
  )
  ON CONFLICT(idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
`);

/**
 * Accept a notification, or explain why not.
 *
 * The whole promise of the service is made here: once this returns ok, the row
 * is on disk and delivery is our problem. Everything that can be rejected must
 * be rejected *before* that point — after it, the caller is gone.
 */
export async function enqueue(input: EnqueueInput): Promise<EnqueueResult> {
  const source = asString(input.source);
  if (!source) return { ok: false, error: "source is required", field: "source" };

  const eventType = asString(input.event_type);
  if (!eventType) return { ok: false, error: "event_type is required", field: "event_type" };

  const targetUrl = asString(input.target_url);
  if (!targetUrl) return { ok: false, error: "target_url is required", field: "target_url" };

  const method = (asString(input.method) ?? "POST").toUpperCase();
  if (!METHODS.has(method)) {
    return { ok: false, error: `unsupported method ${method}`, field: "method" };
  }

  const headers: Record<string, string> = {};
  if (input.headers != null) {
    if (typeof input.headers !== "object" || Array.isArray(input.headers)) {
      return { ok: false, error: "headers must be an object", field: "headers" };
    }
    for (const [k, v] of Object.entries(input.headers as Record<string, unknown>)) {
      if (typeof v !== "string") {
        return { ok: false, error: `header ${k} must be a string`, field: "headers" };
      }
      headers[k] = v;
    }
  }

  // Body is stored verbatim as a string. The service does not parse, validate
  // or transform vendor payloads — that knowledge belongs to the caller.
  const body =
    input.body == null
      ? null
      : typeof input.body === "string"
        ? input.body
        : JSON.stringify(input.body);

  const policyName: PolicyName = isPolicyName(input.policy) ? input.policy : "standard";
  const policy = clampOverrides(POLICIES[policyName], input.policy_overrides);

  // Rejected here rather than dead-lettered: a blocked target is a bug in the
  // caller, and a synchronous 400 reaches the developer who can fix it. The
  // worker re-checks before every attempt anyway, because DNS can change after
  // we accept.
  const target = await checkTarget(targetUrl);
  if (!target.ok && !target.transient) {
    return { ok: false, error: `${target.kind}: ${target.reason}`, field: "target_url" };
  }

  const now = Date.now();
  const notificationId = id();
  const idempotencyKey = asString(input.idempotency_key);

  const info = insert.run({
    id: notificationId,
    idempotency_key: idempotencyKey,
    source,
    event_type: eventType,
    target_url: targetUrl,
    method,
    headers: JSON.stringify(headers),
    body,
    now,
    policy_name: policyName,
    max_attempts: policy.maxAttempts,
    base_delay_ms: policy.baseDelayMs,
    backoff_factor: policy.factor,
    max_delay_ms: policy.maxDelayMs,
    timeout_ms: policy.timeoutMs,
  });

  // Zero rows changed means the idempotency key already existed: return the
  // original id so a retrying caller converges instead of duplicating.
  if (info.changes === 0 && idempotencyKey) {
    const existing = db
      .prepare<[string], { id: string; status: NotificationRow["status"] }>(
        `SELECT id, status FROM notifications WHERE idempotency_key = ?`,
      )
      .get(idempotencyKey);
    if (existing) {
      return { ok: true, id: existing.id, duplicate: true, status: existing.status };
    }
  }
  
  return { ok: true, id: notificationId, duplicate: false, status: "pending" };
}
