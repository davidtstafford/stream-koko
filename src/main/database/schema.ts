export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Viewers table
CREATE TABLE IF NOT EXISTS viewers (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT,
  is_moderator BOOLEAN DEFAULT 0,
  is_vip BOOLEAN DEFAULT 0,
  is_subscriber BOOLEAN DEFAULT 0,
  is_banned BOOLEAN DEFAULT 0,
  first_seen_at TEXT,
  last_seen_at TEXT,
  message_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_viewers_username ON viewers(username);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  viewer_id TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  message TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  emotes TEXT,
  badges TEXT,
  was_read_by_tts BOOLEAN DEFAULT 0,
  FOREIGN KEY (viewer_id) REFERENCES viewers(id)
);

CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON chat_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chat_viewer ON chat_messages(viewer_id);

-- Kokoro TTS voices — single source of truth, no provider column
CREATE TABLE IF NOT EXISTS tts_voices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voice_id TEXT NOT NULL UNIQUE,   -- e.g. 'af_heart', 'am_adam'
  name TEXT NOT NULL,              -- Human-readable display name
  language_code TEXT NOT NULL,     -- 'en-US', 'en-GB', etc.
  language_name TEXT NOT NULL,     -- 'American English', 'British English', etc.
  gender TEXT,                     -- 'female', 'male'
  is_custom BOOLEAN DEFAULT 0,     -- User-added voice
  is_available BOOLEAN DEFAULT 1,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voices_language ON tts_voices(language_name);
CREATE INDEX IF NOT EXISTS idx_voices_gender ON tts_voices(gender);

-- Viewer voice preferences (kokoro voice only — no provider)
CREATE TABLE IF NOT EXISTS viewer_voice_preferences (
  viewer_id TEXT PRIMARY KEY,
  voice_id TEXT NOT NULL,
  speed REAL DEFAULT 1.0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (viewer_id) REFERENCES viewers(id)
);

-- Viewer TTS restrictions table
CREATE TABLE IF NOT EXISTS viewer_tts_restrictions (
  viewer_id TEXT PRIMARY KEY,
  is_muted BOOLEAN DEFAULT 0,
  mute_period_mins INTEGER,
  muted_at TEXT,
  mute_expires_at TEXT,
  has_cooldown BOOLEAN DEFAULT 0,
  cooldown_gap_seconds INTEGER,
  cooldown_period_mins INTEGER,
  cooldown_set_at TEXT,
  cooldown_expires_at TEXT,
  last_tts_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (viewer_id) REFERENCES viewers(id)
);

-- Chat commands table
CREATE TABLE IF NOT EXISTS chat_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command_name TEXT NOT NULL UNIQUE,
  command_prefix TEXT DEFAULT '~',
  description TEXT,
  enabled BOOLEAN DEFAULT 1,
  permission_level TEXT DEFAULT 'viewer',
  rate_limit_seconds INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Command usage table
CREATE TABLE IF NOT EXISTS command_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command_name TEXT NOT NULL,
  viewer_id TEXT NOT NULL,
  username TEXT NOT NULL,
  success BOOLEAN DEFAULT 1,
  error_message TEXT,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (viewer_id) REFERENCES viewers(id)
);

CREATE INDEX IF NOT EXISTS idx_usage_command ON command_usage(command_name);
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON command_usage(timestamp DESC);

-- TTS access redeems table
CREATE TABLE IF NOT EXISTS tts_access_redeems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  viewer_id TEXT NOT NULL,
  username TEXT NOT NULL,
  redeem_name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  redeemed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  FOREIGN KEY (viewer_id) REFERENCES viewers(id)
);

CREATE INDEX IF NOT EXISTS idx_redeems_viewer ON tts_access_redeems(viewer_id);
CREATE INDEX IF NOT EXISTS idx_redeems_active ON tts_access_redeems(is_active, expires_at);

-- Discord settings table
CREATE TABLE IF NOT EXISTS discord_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

/**
 * Built-in Kokoro voice definitions — seeded on first run.
 * Source: https://www.npmjs.com/package/kokoro-js
 */
export const BUILTIN_VOICES = [
  // American English — Female
  { voice_id: 'af_heart',    name: 'Heart',    language_code: 'en-US', language_name: 'American English', gender: 'female', description: 'Warm, expressive — highly recommended ❤️' },
  { voice_id: 'af_alloy',    name: 'Alloy',    language_code: 'en-US', language_name: 'American English', gender: 'female', description: 'Clear and neutral' },
  { voice_id: 'af_aoede',    name: 'Aoede',    language_code: 'en-US', language_name: 'American English', gender: 'female', description: '' },
  { voice_id: 'af_bella',    name: 'Bella',    language_code: 'en-US', language_name: 'American English', gender: 'female', description: 'High quality, expressive 🔥' },
  { voice_id: 'af_jessica',  name: 'Jessica',  language_code: 'en-US', language_name: 'American English', gender: 'female', description: '' },
  { voice_id: 'af_kore',     name: 'Kore',     language_code: 'en-US', language_name: 'American English', gender: 'female', description: '' },
  { voice_id: 'af_nicole',   name: 'Nicole',   language_code: 'en-US', language_name: 'American English', gender: 'female', description: 'Headphone-style delivery 🎧' },
  { voice_id: 'af_nova',     name: 'Nova',     language_code: 'en-US', language_name: 'American English', gender: 'female', description: '' },
  { voice_id: 'af_river',    name: 'River',    language_code: 'en-US', language_name: 'American English', gender: 'female', description: '' },
  { voice_id: 'af_sarah',    name: 'Sarah',    language_code: 'en-US', language_name: 'American English', gender: 'female', description: '' },
  { voice_id: 'af_sky',      name: 'Sky',      language_code: 'en-US', language_name: 'American English', gender: 'female', description: '' },
  // American English — Male
  { voice_id: 'am_adam',     name: 'Adam',     language_code: 'en-US', language_name: 'American English', gender: 'male', description: '' },
  { voice_id: 'am_echo',     name: 'Echo',     language_code: 'en-US', language_name: 'American English', gender: 'male', description: '' },
  { voice_id: 'am_eric',     name: 'Eric',     language_code: 'en-US', language_name: 'American English', gender: 'male', description: '' },
  { voice_id: 'am_fenrir',   name: 'Fenrir',   language_code: 'en-US', language_name: 'American English', gender: 'male', description: '' },
  { voice_id: 'am_liam',     name: 'Liam',     language_code: 'en-US', language_name: 'American English', gender: 'male', description: '' },
  { voice_id: 'am_michael',  name: 'Michael',  language_code: 'en-US', language_name: 'American English', gender: 'male', description: '' },
  { voice_id: 'am_onyx',     name: 'Onyx',     language_code: 'en-US', language_name: 'American English', gender: 'male', description: '' },
  { voice_id: 'am_puck',     name: 'Puck',     language_code: 'en-US', language_name: 'American English', gender: 'male', description: '' },
  { voice_id: 'am_santa',    name: 'Santa',    language_code: 'en-US', language_name: 'American English', gender: 'male', description: '🎅' },
  // British English — Female
  { voice_id: 'bf_alice',    name: 'Alice',    language_code: 'en-GB', language_name: 'British English', gender: 'female', description: '' },
  { voice_id: 'bf_emma',     name: 'Emma',     language_code: 'en-GB', language_name: 'British English', gender: 'female', description: '' },
  { voice_id: 'bf_isabella', name: 'Isabella', language_code: 'en-GB', language_name: 'British English', gender: 'female', description: '' },
  { voice_id: 'bf_lily',     name: 'Lily',     language_code: 'en-GB', language_name: 'British English', gender: 'female', description: '' },
  // British English — Male
  { voice_id: 'bm_daniel',   name: 'Daniel',   language_code: 'en-GB', language_name: 'British English', gender: 'male', description: '' },
  { voice_id: 'bm_fable',    name: 'Fable',    language_code: 'en-GB', language_name: 'British English', gender: 'male', description: '' },
  { voice_id: 'bm_george',   name: 'George',   language_code: 'en-GB', language_name: 'British English', gender: 'male', description: '' },
  { voice_id: 'bm_lewis',    name: 'Lewis',    language_code: 'en-GB', language_name: 'British English', gender: 'male', description: '' },
];
