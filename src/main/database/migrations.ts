import { getDatabase } from './connection';
import { SCHEMA_SQL, SCHEMA_VERSION, BUILTIN_VOICES } from './schema';

export function initializeDatabase(): void {
  const db = getDatabase();

  // Check current schema version
  const versionTable = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'
  `).get();

  let currentVersion = 0;
  if (versionTable) {
    const versionRow = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number };
    currentVersion = versionRow?.version || 0;
  }

  if (currentVersion < SCHEMA_VERSION) {
    console.log(`Migrating database from version ${currentVersion} to ${SCHEMA_VERSION}`);
    db.exec(SCHEMA_SQL);
    db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
    console.log('Database migration completed');
  } else {
    console.log(`Database is up to date (version ${currentVersion})`);
  }

  insertDefaultSettings();
  insertDefaultCommands();
  seedBuiltinVoices();
}

function insertDefaultSettings(): void {
  const db = getDatabase();

  const defaults = [
    { key: 'twitch_connected',         value: 'false' },
    { key: 'tts_enabled',              value: 'true' },
    { key: 'tts_default_voice',        value: 'af_heart' },
    { key: 'tts_default_volume',       value: '1.0' },
    { key: 'tts_default_speed',        value: '1.0' },
    { key: 'obs_browser_source_enabled', value: 'false' },
    { key: 'obs_browser_source_port',  value: '8080' },
    { key: 'tts_mute_in_app',          value: 'false' },
    { key: 'auto_connect',             value: 'true' },
    { key: 'tts_access_restricted',    value: 'false' },
    { key: 'tts_access_subscribers',   value: 'false' },
    { key: 'tts_access_vips',          value: 'false' },
    { key: 'tts_access_moderators',    value: 'false' },
    { key: 'tts_access_redeems',       value: 'false' },
    { key: 'tts_redeem_name',          value: 'Give Me TTS' },
    { key: 'tts_redeem_duration',      value: '30' },
    // Kokoro model settings
    { key: 'kokoro_model_id',          value: 'onnx-community/Kokoro-82M-v1.0-ONNX' },
    { key: 'kokoro_model_dtype',       value: 'q8' },
    { key: 'kokoro_model_loaded',      value: 'false' },
    // Discord
    { key: 'discord_token',            value: '' },
    { key: 'discord_client_id',        value: '' },
    { key: 'discord_guild_id',         value: '' },
    { key: 'discord_enabled',          value: 'false' },
  ];

  const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const s of defaults) stmt.run(s.key, s.value);
}

function insertDefaultCommands(): void {
  const db = getDatabase();

  const commands = [
    { name: 'setvoice',       description: 'Set your Kokoro TTS voice (e.g. ~setvoice af_heart)', level: 'viewer',    enabled: 1 },
    { name: 'voices',         description: 'List available Kokoro voices',                         level: 'viewer',    enabled: 1 },
    { name: 'mutevoice',      description: 'Mute a viewer\'s TTS (Moderator only)',                level: 'moderator', enabled: 1 },
    { name: 'unmutevoice',    description: 'Unmute a viewer\'s TTS (Moderator only)',              level: 'moderator', enabled: 1 },
    { name: 'cooldown',       description: 'Set TTS cooldown for a viewer (Moderator only)',       level: 'moderator', enabled: 1 },
    { name: 'clearqueue',     description: 'Clear the TTS queue (Moderator only)',                 level: 'moderator', enabled: 1 },
    { name: 'mutetts',        description: 'Pause TTS globally (Moderator only)',                  level: 'moderator', enabled: 1 },
    { name: 'unmutetts',      description: 'Resume TTS globally (Moderator only)',                 level: 'moderator', enabled: 1 },
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO chat_commands (command_name, description, permission_level, enabled)
    VALUES (?, ?, ?, ?)
  `);
  for (const cmd of commands) stmt.run(cmd.name, cmd.description, cmd.level, cmd.enabled);
}

function seedBuiltinVoices(): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO tts_voices
      (voice_id, name, language_code, language_name, gender, is_custom, is_available, description)
    VALUES (?, ?, ?, ?, ?, 0, 1, ?)
  `);

  for (const v of BUILTIN_VOICES) {
    stmt.run(v.voice_id, v.name, v.language_code, v.language_name, v.gender, v.description);
  }

  // Remove any built-in voice no longer in the supported list (e.g. previously
  // seeded non-English voices that kokoro-js does not actually support).
  const validIds = BUILTIN_VOICES.map(v => `'${v.voice_id}'`).join(',');
  db.exec(`DELETE FROM tts_voices WHERE is_custom = 0 AND voice_id NOT IN (${validIds})`);

  console.log(`Seeded ${BUILTIN_VOICES.length} built-in Kokoro voices`);
}
