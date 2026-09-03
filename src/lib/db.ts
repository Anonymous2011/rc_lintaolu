import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

/**
 * Single SQLite connection for the whole process.
 *
 * Cached on globalThis because `next dev` re-evaluates modules on hot reload;
 * without this we would leak a file handle per edit and eventually hit
 * SQLITE_BUSY. In production this module is evaluated once.
 */
declare global {
  var __notifierDb: Database.Database | undefined;
}

const DB_PATH =
  process.env.NOTIFIER_DB_PATH ??
  path.join(process.cwd(), "data", "notifications.db");

const SCHEMA = `
-- #region notifications
-- One row per notification the service has accepted ownership of.
CREATE TABLE IF NOT EXISTS notifications (
  id                TEXT PRIMARY KEY,
  idempotency_key   TEXT,
  source            TEXT NOT NULL,           -- which business system submitted it
  event_type        TEXT NOT NULL,           -- e.g. user.registered (for humans, not routing)
  target_url        TEXT NOT NULL,
  method            TEXT NOT NULL DEFAULT 'POST',
  headers           TEXT NOT NULL DEFAULT '{}',  -- JSON object, verbatim from caller
  body              TEXT,                        -- opaque string, verbatim from caller

  status            TEXT NOT NULL,           -- pending | in_flight | delivered | dead
  attempt_count     INTEGER NOT NULL DEFAULT 0,
  next_attempt_at   INTEGER NOT NULL,        -- epoch ms; the scheduler's only clock
  lease_expires_at  INTEGER,                 -- set while in_flight; recovers crashed workers

  -- Retry policy is frozen onto the row at accept time rather than looked up
  -- by name at delivery time. Editing a policy definition must not silently
  -- change the contract for work already accepted under the old one.
  policy_name       TEXT    NOT NULL DEFAULT 'standard',
  max_attempts      INTEGER NOT NULL DEFAULT 8,
  base_delay_ms     INTEGER NOT NULL DEFAULT 1000,
  backoff_factor    REAL    NOT NULL DEFAULT 2,
  max_delay_ms      INTEGER NOT NULL DEFAULT 300000,
  timeout_ms        INTEGER NOT NULL DEFAULT 10000,

  last_status_code  INTEGER,
  last_error_kind   TEXT,
  last_error        TEXT,

  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  delivered_at      INTEGER,
  dead_at           INTEGER
);

-- Idempotency is only meaningful when the caller supplies a key, so the
-- uniqueness constraint is partial rather than a plain UNIQUE column.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idem
  ON notifications(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- The claim query: "what is due right now". Order matters (status first).
CREATE INDEX IF NOT EXISTS idx_notifications_due
  ON notifications(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON notifications(created_at DESC);

-- #endregion

-- #region attempts
-- One row per HTTP attempt. This is the audit trail the monitor page reads:
-- without it, a failed notification tells you nothing about *why* or how often.
CREATE TABLE IF NOT EXISTS attempts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id  TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  attempt_no       INTEGER NOT NULL,
  started_at       INTEGER NOT NULL,
  duration_ms      INTEGER NOT NULL,
  status_code      INTEGER,                  -- null when no response was received
  outcome          TEXT NOT NULL,            -- success | retryable | terminal
  error_kind       TEXT,                     -- timeout | connection | http_5xx | ...
  error_message    TEXT,
  next_attempt_at  INTEGER                   -- null when this was the final attempt
);

CREATE INDEX IF NOT EXISTS idx_attempts_notification
  ON attempts(notification_id, attempt_no);

CREATE INDEX IF NOT EXISTS idx_attempts_started
  ON attempts(started_at DESC);
-- #endregion
`;

function open(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);

  // WAL lets the monitor page read while the delivery worker writes, instead
  // of the two blocking each other.
  db.pragma("journal_mode = WAL");
  // NORMAL trades an fsync per commit for one per checkpoint. Safe against
  // process crashes (which is what we actually defend against), not against
  // OS crashes. Revisit if this ever runs somewhere that matters.
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/**
 * Additive column migrations for databases created by an earlier version.
 *
 * `CREATE TABLE IF NOT EXISTS` silently does nothing when the table already
 * exists, so new columns would otherwise only appear for people who deleted
 * their database file. Adding columns is the only shape of change this handles
 * — anything more would want a real migration tool.
 */
function migrate(db: Database.Database): void {
  const existing = new Set(
    db.prepare<[], { name: string }>("PRAGMA table_info(notifications)").all().map((c) => c.name),
  );

  const added: [string, string][] = [
    ["policy_name", "TEXT NOT NULL DEFAULT 'standard'"],
    ["base_delay_ms", "INTEGER NOT NULL DEFAULT 1000"],
    ["backoff_factor", "REAL NOT NULL DEFAULT 2"],
    ["max_delay_ms", "INTEGER NOT NULL DEFAULT 300000"],
    ["timeout_ms", "INTEGER NOT NULL DEFAULT 10000"],
  ];

  for (const [name, decl] of added) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE notifications ADD COLUMN ${name} ${decl}`);
    }
  }
}

export const db: Database.Database = globalThis.__notifierDb ?? open();
if (process.env.NODE_ENV !== "production") globalThis.__notifierDb = db;

export { DB_PATH };
