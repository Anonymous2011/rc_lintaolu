import { db } from "./db";
import type { AttemptRow, NotificationRow, NotificationStatus } from "./types";

export type NotificationFilter = "all" | NotificationStatus | "failing";

export interface NotificationListItem extends NotificationRow {
  attempts_recorded: number;
}

/**
 * `failing` deliberately spans two statuses: anything dead, plus anything
 * still pending that has already failed at least once. A reviewer looking for
 * "what is going wrong" wants both, and neither status alone answers it.
 */
export function listNotifications(
  filter: NotificationFilter = "all",
  limit = 100,
): NotificationListItem[] {
  const where =
    filter === "all"
      ? ""
      : filter === "failing"
        ? `WHERE n.status = 'dead' OR (n.attempt_count > 0 AND n.status != 'delivered')`
        : `WHERE n.status = @filter`;

  return db
    .prepare<{ filter: string; limit: number }, NotificationListItem>(
      `SELECT n.*, (SELECT COUNT(*) FROM attempts a WHERE a.notification_id = n.id)
                     AS attempts_recorded
         FROM notifications n
         ${where}
        ORDER BY n.created_at DESC
        LIMIT @limit`,
    )
    .all({ filter, limit });
}

export function getNotification(id: string): NotificationRow | undefined {
  return db
    .prepare<[string], NotificationRow>(
      `SELECT * FROM notifications WHERE id = ?`,
    )
    .get(id);
}

export function getAttempts(notificationId: string): AttemptRow[] {
  return db
    .prepare<[string], AttemptRow>(
      `SELECT * FROM attempts WHERE notification_id = ? ORDER BY attempt_no ASC`,
    )
    .all(notificationId);
}

/** Attempts across all notifications, newest first — the raw delivery log. */
export function listRecentAttempts(
  limit = 50,
): (AttemptRow & { source: string; event_type: string; target_url: string })[] {
  return db
    .prepare<{ limit: number }, AttemptRow & { source: string; event_type: string; target_url: string }>(
      `SELECT a.*, n.source, n.event_type, n.target_url
         FROM attempts a
         JOIN notifications n ON n.id = a.notification_id
        ORDER BY a.started_at DESC
        LIMIT @limit`,
    )
    .all({ limit });
}

/**
 * Attempts for a batch of notifications, keyed by notification id.
 *
 * The page renders an attempt timeline per row; querying inside the render loop
 * would be N+1. SQLite in-process makes that cheap, but the batch keeps the
 * data-access shape honest for when this is not SQLite.
 */
export function getAttemptsForMany(ids: string[]): Map<string, AttemptRow[]> {
  const byId = new Map<string, AttemptRow[]>();
  if (ids.length === 0) return byId;

  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare<string[], AttemptRow>(
      `SELECT * FROM attempts
        WHERE notification_id IN (${placeholders})
        ORDER BY notification_id, attempt_no ASC`,
    )
    .all(...ids);

  for (const row of rows) {
    const list = byId.get(row.notification_id);
    if (list) list.push(row);
    else byId.set(row.notification_id, [row]);
  }
  return byId;
}

/**
 * Lookup by the caller's own idempotency key.
 *
 * This is the lookup that matters operationally: the caller derives that key
 * from its own business entity, so it can find a notification without having
 * stored our generated id anywhere.
 */
export function getNotificationByIdempotencyKey(
  key: string,
): NotificationRow | undefined {
  return db
    .prepare<[string], NotificationRow>(
      `SELECT * FROM notifications WHERE idempotency_key = ?`,
    )
    .get(key);
}

/** Notifications in one status, newest first — the dead-letter list, mostly. */
export function listByStatus(
  status: NotificationStatus,
  limit = 50,
): NotificationRow[] {
  return db
    .prepare<{ status: string; limit: number }, NotificationRow>(
      `SELECT * FROM notifications
        WHERE status = @status
        ORDER BY created_at DESC
        LIMIT @limit`,
    )
    .all({ status, limit });
}
