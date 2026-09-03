/** Lifecycle of an accepted notification. */
export type NotificationStatus =
  | "pending"    // durably accepted, waiting for its next attempt
  | "in_flight"  // leased by a worker, HTTP call in progress
  | "delivered"  // vendor returned 2xx
  | "dead";      // terminal failure, or retries exhausted

/** What a single HTTP attempt told us to do next. */
export type AttemptOutcome = "success" | "retryable" | "terminal";

/**
 * Why an attempt failed, normalised into a small closed set.
 *
 * Raw error strings vary by platform and vendor and are useless for
 * aggregation; this is what the monitor page groups by. The raw text is kept
 * alongside in `error_message` for debugging.
 */
export type ErrorKind =
  | "http_5xx"      // vendor broken  -> retry
  | "http_429"      // rate limited   -> retry, honour Retry-After
  | "http_408"      // vendor timeout -> retry
  | "http_4xx"      // our request is wrong -> terminal, a human must fix it
  | "http_3xx"      // unexpected redirect  -> terminal, misconfigured target
  | "timeout"       // we gave up waiting -> retry (ambiguous: may have landed)
  | "connection"    // refused / reset / DNS -> retry
  | "invalid_url"   // rejected before any call -> terminal
  | "blocked_host"; // SSRF guard rejected the target -> terminal

export interface NotificationRow {
  id: string;
  idempotency_key: string | null;
  source: string;
  event_type: string;
  target_url: string;
  method: string;
  headers: string;
  body: string | null;
  status: NotificationStatus;
  attempt_count: number;
  next_attempt_at: number;
  lease_expires_at: number | null;
  policy_name: string;
  max_attempts: number;
  base_delay_ms: number;
  backoff_factor: number;
  max_delay_ms: number;
  timeout_ms: number;
  last_status_code: number | null;
  last_error_kind: ErrorKind | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
  delivered_at: number | null;
  dead_at: number | null;
}

export interface AttemptRow {
  id: number;
  notification_id: string;
  attempt_no: number;
  started_at: number;
  duration_ms: number;
  status_code: number | null;
  outcome: AttemptOutcome;
  error_kind: ErrorKind | null;
  error_message: string | null;
  next_attempt_at: number | null;
}

/** Whether an error kind is worth retrying. Single source of truth. */
export const RETRYABLE_KINDS: ReadonlySet<ErrorKind> = new Set<ErrorKind>([
  "http_5xx",
  "http_429",
  "http_408",
  "timeout",
  "connection",
]);
