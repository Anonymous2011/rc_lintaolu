import { db } from "./db";
import { checkTarget } from "./ssrf";
import { backoffDelayMs } from "./policy";
import type { AttemptOutcome, ErrorKind, NotificationRow } from "./types";

/**
 * In-process delivery worker.
 *
 * A background loop inside the web process is the right size for a first
 * version: no broker to run, no second deployment, and the failure mode
 * (process dies) is already handled by the lease + on-disk queue. It is also
 * the first thing that has to change under load — see README "Evolution".
 *
 * The cost is stated plainly: this design assumes exactly one process. Two
 * instances pointed at the same SQLite file would each run a scheduler, and
 * while the lease-claim UPDATE is atomic enough to prevent double delivery,
 * SQLite's single-writer lock makes that a bad idea rather than a supported one.
 */

const TICK_MS = 500;
const MAX_CONCURRENT = 8;
const MAX_PER_HOST = 2;
const LEASE_BUFFER_MS = 30_000;

declare global {
  var __notifierWorker: { timer: NodeJS.Timeout } | undefined;
}

/** Deliveries currently in flight, per target host, in this process. */
const inFlightByHost = new Map<string, number>();
let inFlightTotal = 0;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}

function log(event: string, fields: Record<string, unknown>): void {
  // Deliberately one line of JSON: the shape a log shipper would want, even
  // though in this MVP it only ever reaches a terminal.
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

interface Classification {
  outcome: AttemptOutcome;
  errorKind: ErrorKind | null;
  errorMessage: string | null;
}

function classifyResponse(status: number, bodyPreview: string): Classification {
  if (status >= 200 && status < 300) {
    return { outcome: "success", errorKind: null, errorMessage: null };
  }
  // Redirects are not followed: a 3xx from a notification endpoint means the
  // target is misconfigured, and silently following it could re-POST a payload
  // to an unvalidated host.
  if (status >= 300 && status < 400) {
    return {
      outcome: "terminal",
      errorKind: "http_3xx",
      errorMessage: `HTTP ${status} redirect (not followed)`,
    };
  }
  if (status === 408) {
    return { outcome: "retryable", errorKind: "http_408", errorMessage: "HTTP 408" };
  }
  if (status === 429) {
    return { outcome: "retryable", errorKind: "http_429", errorMessage: "HTTP 429" };
  }
  if (status >= 500) {
    return {
      outcome: "retryable",
      errorKind: "http_5xx",
      errorMessage: `HTTP ${status}${bodyPreview ? `: ${bodyPreview}` : ""}`,
    };
  }
  // Every other 4xx is our fault, not the vendor's. Retrying a malformed
  // request produces identical failures forever and hides the real bug.
  return {
    outcome: "terminal",
    errorKind: "http_4xx",
    errorMessage: `HTTP ${status}${bodyPreview ? `: ${bodyPreview}` : ""}`,
  };
}

function classifyThrow(err: unknown): Classification {
  const e = err as { name?: string; message?: string; cause?: { code?: string } };
  const code = e?.cause?.code;

  if (e?.name === "TimeoutError" || e?.name === "AbortError") {
    // Ambiguous by nature: the vendor may have processed the request and been
    // too slow to say so. We retry anyway — at-least-once means the vendor
    // owns deduplication.
    return { outcome: "retryable", errorKind: "timeout", errorMessage: "request timed out" };
  }
  return {
    outcome: "retryable",
    errorKind: "connection",
    errorMessage: code ? `${code}` : (e?.message ?? "connection failed"),
  };
}

/** `Retry-After` as milliseconds; supports both the seconds and HTTP-date forms. */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const recordAttempt = db.prepare(`
  INSERT INTO attempts (
    notification_id, attempt_no, started_at, duration_ms,
    status_code, outcome, error_kind, error_message, next_attempt_at
  ) VALUES (
    @notification_id, @attempt_no, @started_at, @duration_ms,
    @status_code, @outcome, @error_kind, @error_message, @next_attempt_at
  )
`);

const markDelivered = db.prepare(`
  UPDATE notifications
     SET status = 'delivered', delivered_at = @now, updated_at = @now,
         attempt_count = @attempt_no, lease_expires_at = NULL,
         last_status_code = @status_code, last_error_kind = NULL, last_error = NULL
   WHERE id = @id
`);

const markRetry = db.prepare(`
  UPDATE notifications
     SET status = 'pending', next_attempt_at = @next_attempt_at, updated_at = @now,
         attempt_count = @attempt_no, lease_expires_at = NULL,
         last_status_code = @status_code, last_error_kind = @error_kind, last_error = @error_message
   WHERE id = @id
`);

const markDead = db.prepare(`
  UPDATE notifications
     SET status = 'dead', dead_at = @now, updated_at = @now,
         attempt_count = @attempt_no, lease_expires_at = NULL,
         last_status_code = @status_code, last_error_kind = @error_kind, last_error = @error_message
   WHERE id = @id
`);

/**
 * Attempt result and the notification's new state are written in one
 * transaction. A crash between the two would either lose the audit trail or
 * strand the row in `in_flight` with no record of why.
 */
const settle = db.transaction(
  (
    n: NotificationRow,
    attemptNo: number,
    startedAt: number,
    durationMs: number,
    statusCode: number | null,
    c: Classification,
    nextAttemptAt: number | null,
  ) => {
    recordAttempt.run({
      notification_id: n.id,
      attempt_no: attemptNo,
      started_at: startedAt,
      duration_ms: durationMs,
      status_code: statusCode,
      outcome: c.outcome,
      error_kind: c.errorKind,
      error_message: c.errorMessage,
      next_attempt_at: nextAttemptAt,
    });

    const now = Date.now();
    const common = {
      id: n.id,
      now,
      attempt_no: attemptNo,
      status_code: statusCode,
      error_kind: c.errorKind,
      error_message: c.errorMessage,
    };

    if (c.outcome === "success") markDelivered.run(common);
    else if (nextAttemptAt === null) markDead.run(common);
    else markRetry.run({ ...common, next_attempt_at: nextAttemptAt });
  },
);

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

async function deliver(n: NotificationRow): Promise<void> {
  const attemptNo = n.attempt_count + 1;
  const startedAt = Date.now();
  let statusCode: number | null = null;
  let c: Classification;
  let retryAfterMs: number | null = null;

  // Re-checked per attempt, not just at accept time: a hostname that was
  // public when we accepted it can resolve somewhere else by the time we call.
  const target = await checkTarget(n.target_url);
  if (!target.ok) {
    c = {
      outcome: target.transient ? "retryable" : "terminal",
      errorKind: target.kind,
      errorMessage: target.reason,
    };
  } else {
    try {
      const res = await fetch(n.target_url, {
        method: n.method,
        headers: JSON.parse(n.headers) as Record<string, string>,
        body: n.method === "GET" ? undefined : (n.body ?? undefined),
        redirect: "manual",
        signal: AbortSignal.timeout(n.timeout_ms),
      });
      statusCode = res.status;
      retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));

      // The caller does not want the vendor's response body, but a truncated
      // slice of it is the difference between "HTTP 400" and a fixable bug.
      const text = await res.text().catch(() => "");
      c = classifyResponse(res.status, text.slice(0, 200).replace(/\s+/g, " ").trim());
    } catch (err) {
      c = classifyThrow(err);
    }
  }

  const durationMs = Date.now() - startedAt;
  const exhausted = attemptNo >= n.max_attempts;

  let nextAttemptAt: number | null = null;
  if (c.outcome === "retryable" && !exhausted) {
    const backoff = backoffDelayMs(
      {
        maxAttempts: n.max_attempts,
        baseDelayMs: n.base_delay_ms,
        factor: n.backoff_factor,
        maxDelayMs: n.max_delay_ms,
        timeoutMs: n.timeout_ms,
      },
      attemptNo,
    );
    // A vendor that tells us when to come back knows better than our curve,
    // but we still cap it so one hostile header cannot park a row for a week.
    const delay = retryAfterMs === null ? backoff : Math.min(retryAfterMs, n.max_delay_ms);
    nextAttemptAt = Date.now() + delay;
  }

  settle(n, attemptNo, startedAt, durationMs, statusCode, c, nextAttemptAt);

  log("delivery.attempt", {
    id: n.id,
    attempt: `${attemptNo}/${n.max_attempts}`,
    host: hostOf(n.target_url),
    status: statusCode,
    outcome: c.outcome,
    error_kind: c.errorKind,
    duration_ms: durationMs,
    next_attempt_in_ms: nextAttemptAt === null ? null : nextAttemptAt - Date.now(),
    final: c.outcome !== "retryable" || nextAttemptAt === null,
  });
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

const reclaimLeases = db.prepare(`
  UPDATE notifications
     SET status = 'pending', lease_expires_at = NULL, updated_at = @now
   WHERE status = 'in_flight' AND lease_expires_at IS NOT NULL AND lease_expires_at < @now
`);

const dueCandidates = db.prepare<{ now: number; limit: number }, NotificationRow>(`
  SELECT * FROM notifications
   WHERE status = 'pending' AND next_attempt_at <= @now
   ORDER BY next_attempt_at ASC
   LIMIT @limit
`);

const claim = db.prepare(`
  UPDATE notifications
     SET status = 'in_flight', lease_expires_at = @lease, updated_at = @now
   WHERE id = @id AND status = 'pending'
`);

function tick(): void {
  const now = Date.now();

  // A worker that died mid-attempt left rows leased forever. Reclaiming them
  // is what makes at-least-once survive a crash, and is also why a delivered
  // notification can be sent twice: we cannot know whether the call landed.
  const reclaimed = reclaimLeases.run({ now });
  if (reclaimed.changes > 0) log("lease.reclaimed", { count: reclaimed.changes });

  if (inFlightTotal >= MAX_CONCURRENT) return;

  const candidates = dueCandidates.all({ now, limit: 50 });
  for (const n of candidates) {
    if (inFlightTotal >= MAX_CONCURRENT) break;

    // Per-host cap: one slow vendor must not consume every slot and stall
    // deliveries to vendors that are perfectly healthy.
    const host = hostOf(n.target_url);
    const active = inFlightByHost.get(host) ?? 0;
    if (active >= MAX_PER_HOST) continue;

    const claimed = claim.run({
      id: n.id,
      now,
      lease: now + n.timeout_ms + LEASE_BUFFER_MS,
    });
    if (claimed.changes === 0) continue;

    inFlightTotal++;
    inFlightByHost.set(host, active + 1);

    void deliver(n)
      .catch((err) => log("delivery.crash", { id: n.id, error: String(err) }))
      .finally(() => {
        inFlightTotal--;
        const remaining = (inFlightByHost.get(host) ?? 1) - 1;
        if (remaining <= 0) inFlightByHost.delete(host);
        else inFlightByHost.set(host, remaining);
      });
  }
}

export function startWorker(): void {
  if (globalThis.__notifierWorker) return;

  // Anything left in_flight belongs to a previous process that is now gone.
  const orphans = db
    .prepare(
      `UPDATE notifications SET status = 'pending', lease_expires_at = NULL WHERE status = 'in_flight'`,
    )
    .run();
  if (orphans.changes > 0) log("startup.requeued", { count: orphans.changes });

  const timer = setInterval(tick, TICK_MS);
  // Do not hold the process open purely for the scheduler.
  timer.unref?.();
  globalThis.__notifierWorker = { timer };

  log("worker.started", { tick_ms: TICK_MS, max_concurrent: MAX_CONCURRENT });
}
