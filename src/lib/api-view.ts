import type { AttemptRow, NotificationRow } from "./types";

/**
 * Maps a database row to the shape the API returns.
 *
 * The mapping exists even though several field values are currently identical
 * to the column values: it is what stops a schema rename from silently
 * becoming a breaking API change. The public vocabulary is declared here, once.
 *
 * Two things are deliberately never returned:
 *
 *  - `headers`, because they carry the caller's vendor credentials. A read API
 *    that hands back Authorization tokens turns a debugging convenience into a
 *    credential-disclosure endpoint.
 *  - `body`, because it is the caller's payload and may contain personal data.
 *    Reconciliation needs the idempotency key, not the payload.
 */

const iso = (ms: number | null): string | null =>
  ms === null ? null : new Date(ms).toISOString();

export function toPublicNotification(n: NotificationRow, attempts?: AttemptRow[]) {
  return {
    id: n.id,
    idempotency_key: n.idempotency_key,
    status: n.status,
    source: n.source,
    event_type: n.event_type,
    target: { url: n.target_url, method: n.method },
    policy: n.policy_name,
    attempts: { made: n.attempt_count, max: n.max_attempts },
    created_at: iso(n.created_at),
    delivered_at: iso(n.delivered_at),
    dead_at: iso(n.dead_at),
    // Only meaningful while the notification is still being worked on.
    next_attempt_at:
      n.status === "pending" || n.status === "in_flight" ? iso(n.next_attempt_at) : null,
    last_error:
      n.last_error_kind === null
        ? null
        : { kind: n.last_error_kind, status_code: n.last_status_code, message: n.last_error },
    ...(attempts ? { history: attempts.map(toPublicAttempt) } : {}),
  };
}

export function toPublicAttempt(a: AttemptRow) {
  return {
    attempt: a.attempt_no,
    at: iso(a.started_at),
    duration_ms: a.duration_ms,
    status_code: a.status_code,
    outcome: a.outcome,
    error: a.error_kind === null ? null : { kind: a.error_kind, message: a.error_message },
    next_attempt_at: iso(a.next_attempt_at),
  };
}
