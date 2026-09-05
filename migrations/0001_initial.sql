PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    telegram_id TEXT PRIMARY KEY,

    username TEXT,

    first_name TEXT,

    timezone TEXT NOT NULL DEFAULT 'UTC',

    daily_digest_enabled INTEGER NOT NULL DEFAULT 0,

    daily_digest_hour_utc INTEGER NOT NULL DEFAULT 9,

    last_digest_date TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conferences (
    id TEXT PRIMARY KEY,

    title TEXT NOT NULL,

    year INTEGER NOT NULL,

    full_name TEXT,

    link TEXT,

    deadline TEXT,

    abstract_deadline TEXT,

    deadline_utc TEXT,

    abstract_deadline_utc TEXT,

    timezone TEXT,

    place TEXT,

    date TEXT,

    start TEXT,

    end TEXT,

    topics TEXT,

    note TEXT,

    hindex INTEGER,

    paperslink TEXT,

    pwclink TEXT,

    first_seen_at TEXT NOT NULL,

    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conferences_deadline
ON conferences(deadline_utc);

CREATE INDEX IF NOT EXISTS idx_conferences_place
ON conferences(place);

CREATE INDEX IF NOT EXISTS idx_conferences_title
ON conferences(title);

CREATE TABLE IF NOT EXISTS saved_conferences (
    telegram_id TEXT NOT NULL,

    conference_id TEXT NOT NULL,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (
        telegram_id,
        conference_id
    ),

    FOREIGN KEY (
        telegram_id
    )
    REFERENCES users(
        telegram_id
    )
    ON DELETE CASCADE,

    FOREIGN KEY (
        conference_id
    )
    REFERENCES conferences(
        id
    )
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_saved_user
ON saved_conferences(
    telegram_id
);

CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    telegram_id TEXT NOT NULL,

    conference_id TEXT NOT NULL,

    days_before INTEGER NOT NULL,

    remind_at TEXT NOT NULL,

    sent INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (
        telegram_id,
        conference_id,
        days_before
    ),

    FOREIGN KEY (
        telegram_id
    )
    REFERENCES users(
        telegram_id
    )
    ON DELETE CASCADE,

    FOREIGN KEY (
        conference_id
    )
    REFERENCES conferences(
        id
    )
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reminders_due
ON reminders(
    sent,
    remind_at
);

CREATE TABLE IF NOT EXISTS user_topics (
    telegram_id TEXT NOT NULL,

    topic TEXT NOT NULL,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (
        telegram_id,
        topic
    ),

    FOREIGN KEY (
        telegram_id
    )
    REFERENCES users(
        telegram_id
    )
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_locations (
    telegram_id TEXT NOT NULL,

    location TEXT NOT NULL,

    created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (
        telegram_id,
        location
    ),

    FOREIGN KEY (
        telegram_id
    )
    REFERENCES users(
        telegram_id
    )
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,

    value TEXT
);

INSERT OR IGNORE INTO metadata (
    key,
    value
)
VALUES (
    'last_sync',
    ''
);
