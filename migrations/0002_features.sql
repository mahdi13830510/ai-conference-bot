PRAGMA foreign_keys = ON;

/* =========================================================
   USERS: digest scheduling, quiet hours, automation
   ========================================================= */

ALTER TABLE users ADD COLUMN digest_frequency TEXT NOT NULL DEFAULT 'daily';
ALTER TABLE users ADD COLUMN digest_weekday INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN quiet_hours_start INTEGER;
ALTER TABLE users ADD COLUMN quiet_hours_end INTEGER;
ALTER TABLE users ADD COLUMN auto_reminder_days INTEGER;
ALTER TABLE users ADD COLUMN escalating_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN alert_new_conferences INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN alert_deadline_changes INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN sort_preference TEXT NOT NULL DEFAULT 'deadline';
ALTER TABLE users ADD COLUMN min_rank TEXT;
ALTER TABLE users ADD COLUMN language_code TEXT;
ALTER TABLE users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_digest
ON users(daily_digest_enabled, blocked);

/* =========================================================
   CONFERENCES: rankings, format, geography, provenance
   ========================================================= */

ALTER TABLE conferences ADD COLUMN core_rank TEXT;
ALTER TABLE conferences ADD COLUMN core_name TEXT;
ALTER TABLE conferences ADD COLUMN format TEXT NOT NULL DEFAULT 'tba';
ALTER TABLE conferences ADD COLUMN country TEXT;
ALTER TABLE conferences ADD COLUMN city TEXT;
ALTER TABLE conferences ADD COLUMN cfp_link TEXT;
ALTER TABLE conferences ADD COLUMN source TEXT NOT NULL DEFAULT 'ai-deadlines';
ALTER TABLE conferences ADD COLUMN previous_deadline_utc TEXT;
ALTER TABLE conferences ADD COLUMN deadline_changed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_conferences_rank
ON conferences(core_rank);

CREATE INDEX IF NOT EXISTS idx_conferences_format
ON conferences(format);

CREATE INDEX IF NOT EXISTS idx_conferences_country
ON conferences(country);

/* =========================================================
   FULL-TEXT SEARCH
   ========================================================= */

CREATE VIRTUAL TABLE IF NOT EXISTS conferences_fts
USING fts5(
    id UNINDEXED,
    title,
    full_name,
    place,
    topics,
    core_name,
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS conferences_fts_insert
AFTER INSERT ON conferences
BEGIN
    INSERT INTO conferences_fts (
        id, title, full_name, place, topics, core_name
    )
    VALUES (
        new.id, new.title, new.full_name,
        new.place, new.topics, new.core_name
    );
END;

CREATE TRIGGER IF NOT EXISTS conferences_fts_delete
AFTER DELETE ON conferences
BEGIN
    DELETE FROM conferences_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS conferences_fts_update
AFTER UPDATE ON conferences
BEGIN
    DELETE FROM conferences_fts WHERE id = old.id;
    INSERT INTO conferences_fts (
        id, title, full_name, place, topics, core_name
    )
    VALUES (
        new.id, new.title, new.full_name,
        new.place, new.topics, new.core_name
    );
END;

INSERT INTO conferences_fts (id, title, full_name, place, topics, core_name)
SELECT id, title, full_name, place, topics, core_name FROM conferences;

/* =========================================================
   REMINDERS: multiple kinds per conference
   ========================================================= */

/*
 * The original table carried UNIQUE(telegram_id, conference_id,
 * days_before), which blocks a paper and an abstract reminder at
 * the same offset. SQLite cannot drop an implicit unique index,
 * so the table is rebuilt.
 */

CREATE TABLE reminders_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL,
    conference_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'paper',
    days_before INTEGER NOT NULL,
    remind_at TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    auto INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (telegram_id, conference_id, kind, days_before),

    FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE,
    FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE
);

INSERT INTO reminders_new (
    id, telegram_id, conference_id, kind,
    days_before, remind_at, sent, auto, created_at
)
SELECT
    id, telegram_id, conference_id, 'paper',
    days_before, remind_at, sent, 0, created_at
FROM reminders;

DROP TABLE reminders;

ALTER TABLE reminders_new RENAME TO reminders;

CREATE INDEX IF NOT EXISTS idx_reminders_due
ON reminders(sent, remind_at);

/* =========================================================
   MUTING
   ========================================================= */

CREATE TABLE IF NOT EXISTS muted_conferences (
    telegram_id TEXT NOT NULL,
    conference_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (telegram_id, conference_id),

    FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE,
    FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE
);

/* =========================================================
   SAVED SEARCHES
   ========================================================= */

CREATE TABLE IF NOT EXISTS saved_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL,
    query TEXT NOT NULL,
    notify INTEGER NOT NULL DEFAULT 1,
    last_notified_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (telegram_id, query),

    FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_notify
ON saved_searches(notify);

/* =========================================================
   CALLBACK TOKENS (64-byte callback_data ceiling)
   ========================================================= */

CREATE TABLE IF NOT EXISTS callback_tokens (
    token TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_callback_tokens_created
ON callback_tokens(created_at);

/* =========================================================
   UPDATE DEDUPLICATION
   ========================================================= */

CREATE TABLE IF NOT EXISTS processed_updates (
    update_id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_processed_updates_created
ON processed_updates(created_at);

/* =========================================================
   PENDING INPUT (force-reply prompts)
   ========================================================= */

CREATE TABLE IF NOT EXISTS pending_input (
    telegram_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

/* =========================================================
   ACCEPTANCE RATES AND VENUE HISTORY
   ========================================================= */

CREATE TABLE IF NOT EXISTS acceptance_rates (
    venue TEXT NOT NULL,
    year INTEGER NOT NULL,
    rate REAL,
    accepted INTEGER,
    submitted INTEGER,

    PRIMARY KEY (venue, year)
);

CREATE TABLE IF NOT EXISTS venue_history (
    venue TEXT NOT NULL,
    year INTEGER NOT NULL,
    deadline_utc TEXT,
    place TEXT,
    link TEXT,

    PRIMARY KEY (venue, year)
);

/* =========================================================
   VENUE / COUNTRY INFO
   ========================================================= */

CREATE TABLE IF NOT EXISTS country_info (
    country TEXT PRIMARY KEY,
    visa_url TEXT,
    visa_note TEXT,
    currency TEXT
);

/* =========================================================
   NOTIFICATION LEDGER (dedupes alerts across cron runs)
   ========================================================= */

CREATE TABLE IF NOT EXISTS notification_log (
    telegram_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    reference TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (telegram_id, kind, reference)
);
