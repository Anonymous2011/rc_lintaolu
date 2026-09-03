/**
 * Retry policies.
 *
 * Deliberately free of Node-only imports: the console form imports this to
 * preview a delivery schedule in the browser, and the worker imports it to
 * compute the real one. One definition, two consumers, no drift.
 *
 * The service owns these named policies rather than accepting arbitrary retry
 * parameters from callers. A caller choosing "patient" is expressing intent
 * ("this must not be lost"); a caller passing baseDelayMs=1 is expressing a
 * mistake. The console can still override the numbers, because its whole job
 * is to let a human explore the behaviour.
 */
export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  factor: number;
  maxDelayMs: number;
  timeoutMs: number;
}

// #region policies
export const POLICIES = {
  /**
   * The default. Doubling from 1s with a 5 minute ceiling, which spends most of
   * its attempts in the first minute (where transient blips actually resolve)
   * and then settles into a slow poll.
   */
  standard: {
    maxAttempts: 12,
    baseDelayMs: 1_000,
    factor: 2,
    maxDelayMs: 300_000,
    timeoutMs: 10_000,
  },
  /**
   * For notifications that must survive a real vendor outage rather than a
   * blip: a 1 hour ceiling and enough attempts to cover most of a working day.
   */
  patient: {
    maxAttempts: 20,
    baseDelayMs: 5_000,
    factor: 2,
    maxDelayMs: 3_600_000,
    timeoutMs: 15_000,
  },
  /** Short-lived; useful when the notification is worthless if late. */
  fast: {
    maxAttempts: 4,
    baseDelayMs: 500,
    factor: 2,
    maxDelayMs: 5_000,
    timeoutMs: 5_000,
  },
  /** No retry at all — one shot, then dead-letter. */
  once: {
    maxAttempts: 1,
    baseDelayMs: 0,
    factor: 1,
    maxDelayMs: 0,
    timeoutMs: 10_000,
  },
} as const satisfies Record<string, RetryPolicy>;
// #endregion

export type PolicyName = keyof typeof POLICIES;
export const POLICY_NAMES = Object.keys(POLICIES) as PolicyName[];

export function isPolicyName(v: unknown): v is PolicyName {
  return typeof v === "string" && v in POLICIES;
}

/**
 * Backoff delay before attempt number `attemptNo + 1`.
 *
 * Equal jitter (half the window fixed, half random) rather than a fixed delay:
 * when a vendor recovers from an outage, every queued notification is due at
 * once, and an unjittered schedule turns our own retry queue into a
 * synchronised burst against a service that just came back up.
 *
 * `random` is injectable so the schedule preview can show the un-jittered
 * midpoint instead of a number that changes on every render.
 */
export function backoffDelayMs(
  policy: RetryPolicy,
  attemptNo: number,
  random: () => number = Math.random,
): number {
  if (policy.maxAttempts <= 1) return 0;
  const raw = policy.baseDelayMs * Math.pow(policy.factor, Math.max(0, attemptNo - 1));
  const capped = Math.min(raw, policy.maxDelayMs);
  return Math.round(capped / 2 + random() * (capped / 2));
}

/**
 * The full retry schedule as offsets from the first attempt, ignoring how long
 * each request itself takes. Used by the console to show what a policy means
 * before anyone commits to it.
 */
export function schedulePreviewMs(policy: RetryPolicy): number[] {
  const offsets: number[] = [0];
  let acc = 0;
  for (let attempt = 1; attempt < policy.maxAttempts; attempt++) {
    // 0.5 => the midpoint of the jitter window, so the preview is stable.
    acc += backoffDelayMs(policy, attempt, () => 0.5);
    offsets.push(acc);
  }
  return offsets;
}

/**
 * How long a policy keeps trying before giving up.
 *
 * Computed rather than written down: an earlier version of this project
 * described the policies in prose, and the prose was wrong by an order of
 * magnitude within a day of the numbers changing.
 */
export function totalSpanMs(policy: RetryPolicy): number {
  const schedule = schedulePreviewMs(policy);
  return schedule[schedule.length - 1];
}

export function formatSpan(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}
