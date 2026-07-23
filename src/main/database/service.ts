import { getDatabase } from './connection';

export interface Setting {
  key: string;
  value: string;
  updated_at?: string;
}

export interface Viewer {
  id: string;
  username: string;
  display_name?: string;
  is_moderator?: boolean;
  is_vip?: boolean;
  is_subscriber?: boolean;
  is_banned?: boolean;
  first_seen_at?: string;
  last_seen_at?: string;
  message_count?: number;
}

export interface ChatMessage {
  id?: number;
  viewer_id: string;
  username: string;
  display_name?: string;
  message: string;
  timestamp: string;
  emotes?: string;
  badges?: string;
  was_read_by_tts?: boolean;
}

export class DatabaseService {
  // ── Settings ────────────────────────────────────────────────────────────────
  static getSetting(key: string): string | null {
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Setting | undefined;
    return row?.value ?? null;
  }

  static setSetting(key: string, value: string): void {
    const db = getDatabase();
    db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
      .run(key, value);
  }

  static getAllSettings(): Setting[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM settings').all() as Setting[];
  }

  // ── Viewers ─────────────────────────────────────────────────────────────────
  static upsertViewer(viewer: Viewer): void {
    const db = getDatabase();
    const username = viewer.username.toLowerCase();

    db.prepare(`
      INSERT INTO viewers (id, username, display_name, is_moderator, is_vip, is_subscriber, is_banned,
        first_seen_at, last_seen_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        display_name = excluded.display_name,
        is_moderator = COALESCE(excluded.is_moderator, viewers.is_moderator),
        is_vip = COALESCE(excluded.is_vip, viewers.is_vip),
        is_subscriber = COALESCE(excluded.is_subscriber, viewers.is_subscriber),
        is_banned = COALESCE(excluded.is_banned, viewers.is_banned),
        last_seen_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      viewer.id,
      username,
      viewer.display_name || viewer.username,
      viewer.is_moderator !== undefined ? (viewer.is_moderator ? 1 : 0) : null,
      viewer.is_vip       !== undefined ? (viewer.is_vip       ? 1 : 0) : null,
      viewer.is_subscriber !== undefined ? (viewer.is_subscriber ? 1 : 0) : null,
      viewer.is_banned    !== undefined ? (viewer.is_banned    ? 1 : 0) : null
    );
  }

  static getViewerById(id: string): Viewer | null {
    const db = getDatabase();
    return (db.prepare('SELECT * FROM viewers WHERE id = ?').get(id) as Viewer | undefined) ?? null;
  }

  static getViewerByUsername(username: string): Viewer | null {
    const db = getDatabase();
    return (db.prepare('SELECT * FROM viewers WHERE username = ?').get(username.toLowerCase()) as Viewer | undefined) ?? null;
  }

  static getAllViewers(): Viewer[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM viewers ORDER BY last_seen_at DESC').all() as Viewer[];
  }

  static incrementViewerMessageCount(viewerId: string): void {
    const db = getDatabase();
    db.prepare('UPDATE viewers SET message_count = message_count + 1 WHERE id = ?').run(viewerId);
  }

  static updateViewerBannedStatus(viewerId: string, isBanned: boolean): void {
    const db = getDatabase();
    db.prepare('UPDATE viewers SET is_banned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(isBanned ? 1 : 0, viewerId);
  }

  // ── Chat Messages ───────────────────────────────────────────────────────────
  static insertChatMessages(messages: ChatMessage[]): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO chat_messages
        (viewer_id, username, display_name, message, timestamp, emotes, badges, was_read_by_tts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const run = db.transaction((msgs: ChatMessage[]) => {
      for (const m of msgs) {
        stmt.run(
          m.viewer_id,
          m.username.toLowerCase(),
          m.display_name || m.username,
          m.message,
          m.timestamp,
          m.emotes ?? null,
          m.badges ?? null,
          m.was_read_by_tts ? 1 : 0
        );
      }
    });
    run(messages);
  }

  static getChatHistory(limit = 100, offset = 0): ChatMessage[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM chat_messages ORDER BY timestamp DESC LIMIT ? OFFSET ?
    `).all(limit, offset) as ChatMessage[];
  }

  static searchChatHistory(term: string, limit = 50): ChatMessage[] {
    const db = getDatabase();
    const q = `%${term.toLowerCase()}%`;
    return db.prepare(`
      SELECT * FROM chat_messages
      WHERE LOWER(message) LIKE ? OR LOWER(username) LIKE ?
      ORDER BY timestamp DESC LIMIT ?
    `).all(q, q, limit) as ChatMessage[];
  }

  static clearChatHistory(): void {
    getDatabase().prepare('DELETE FROM chat_messages').run();
  }

  // ── Viewer Status Updates ────────────────────────────────────────────────────

  static updateViewerSubscriberStatus(viewerId: string, isSubscriber: boolean): void {
    const db = getDatabase();
    db.prepare('UPDATE viewers SET is_subscriber = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(isSubscriber ? 1 : 0, viewerId);
  }

  static updateViewerModStatus(viewerId: string, isMod: boolean): void {
    const db = getDatabase();
    db.prepare('UPDATE viewers SET is_moderator = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(isMod ? 1 : 0, viewerId);
  }

  static updateViewerVipStatus(viewerId: string, isVip: boolean): void {
    const db = getDatabase();
    db.prepare('UPDATE viewers SET is_vip = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(isVip ? 1 : 0, viewerId);
  }

  /**
   * Reset is_moderator, is_vip, is_subscriber for all viewers before a full re-sync.
   */
  static resetViewerStatuses(): void {
    const db = getDatabase();
    db.prepare('UPDATE viewers SET is_moderator = 0, is_vip = 0, is_subscriber = 0, updated_at = CURRENT_TIMESTAMP').run();
  }
}
