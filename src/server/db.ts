import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  ChatMessage,
  MediaMode,
  PublicUser,
  RoomId,
} from "../shared/types.js";

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
}

interface MessageRow {
  id: string;
  room_id: RoomId;
  kind: ChatMessage["kind"];
  text: string | null;
  created_at: string;
  user_id: string;
  username: string;
  display_name: string;
  is_admin: number;
}

interface RoomMediaSettingsRow {
  room_id: RoomId;
  media_mode: MediaMode;
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isAdmin: Boolean(row.is_admin),
  };
}

export class AppDatabase {
  readonly db: DatabaseSync;

  constructor(databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        storage_name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('text', 'image', 'file')),
        text TEXT,
        attachment_id TEXT REFERENCES attachments(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_room_created
      ON messages(room_id, created_at, id);

      CREATE INDEX IF NOT EXISTS idx_sessions_expiry
      ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS room_media_settings (
        room_id TEXT PRIMARY KEY,
        media_mode TEXT NOT NULL CHECK (media_mode IN ('p2p', 'wtn'))
      );
    `);
  }

  close() {
    this.db.close();
  }

  createUser(input: {
    username: string;
    displayName: string;
    passwordHash: string;
    isAdmin?: boolean;
  }): PublicUser {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO users (id, username, display_name, password_hash, is_admin, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.username.trim(),
        input.displayName.trim(),
        input.passwordHash,
        input.isAdmin ? 1 : 0,
        createdAt,
      );
    return {
      id,
      username: input.username.trim(),
      displayName: input.displayName.trim(),
      isAdmin: Boolean(input.isAdmin),
    };
  }

  findUserWithPassword(username: string): (PublicUser & { passwordHash: string }) | null {
    const row = this.db
      .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
      .get(username) as unknown as UserRow | undefined;
    if (!row) return null;
    return { ...toPublicUser(row), passwordHash: row.password_hash };
  }

  getUser(id: string): PublicUser | null {
    const row = this.db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(id) as unknown as UserRow | undefined;
    return row ? toPublicUser(row) : null;
  }

  listUsers(): PublicUser[] {
    const rows = this.db
      .prepare("SELECT * FROM users ORDER BY username COLLATE NOCASE")
      .all() as unknown as UserRow[];
    return rows.map(toPublicUser);
  }

  getRoomMediaModes(): Partial<Record<RoomId, MediaMode>> {
    const rows = this.db
      .prepare("SELECT room_id, media_mode FROM room_media_settings")
      .all() as unknown as RoomMediaSettingsRow[];
    return Object.fromEntries(
      rows.map((row) => [row.room_id, row.media_mode]),
    ) as Partial<Record<RoomId, MediaMode>>;
  }

  setRoomMediaMode(roomId: RoomId, mediaMode: MediaMode) {
    this.db
      .prepare(
        `INSERT INTO room_media_settings (room_id, media_mode)
         VALUES (?, ?)
         ON CONFLICT(room_id) DO UPDATE SET media_mode = excluded.media_mode`,
      )
      .run(roomId, mediaMode);
  }

  createSession(tokenHash: string, userId: string, expiresAt: string) {
    this.db
      .prepare(
        "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(tokenHash, userId, expiresAt, new Date().toISOString());
  }

  getUserBySession(tokenHash: string): PublicUser | null {
    const row = this.db
      .prepare(
        `SELECT users.*
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
      )
      .get(tokenHash, new Date().toISOString()) as unknown as UserRow | undefined;
    return row ? toPublicUser(row) : null;
  }

  deleteSession(tokenHash: string) {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  deleteSessionsForUser(userId: string) {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  purgeExpiredSessions() {
    this.db
      .prepare("DELETE FROM sessions WHERE expires_at <= ?")
      .run(new Date().toISOString());
  }

  createMessage(input: {
    roomId: RoomId;
    userId: string;
    text: string;
  }): ChatMessage {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO messages (id, room_id, user_id, kind, text, attachment_id, created_at)
         VALUES (?, ?, ?, 'text', ?, NULL, ?)`,
      )
      .run(
        id,
        input.roomId,
        input.userId,
        input.text,
        createdAt,
      );
    const message = this.getMessage(id);
    if (!message) throw new Error("Message was created but could not be read back");
    return message;
  }

  getMessage(id: string): ChatMessage | null {
    const row = this.db
      .prepare(
        `SELECT
           messages.*,
           users.username,
           users.display_name,
           users.is_admin
         FROM messages
         JOIN users ON users.id = messages.user_id
         WHERE messages.id = ? AND messages.kind = 'text'`,
      )
      .get(id) as unknown as MessageRow | undefined;
    return row ? this.mapMessage(row) : null;
  }

  getMessages(roomId: RoomId, limit = 100): ChatMessage[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM (
           SELECT
             messages.*,
             users.username,
             users.display_name,
             users.is_admin
           FROM messages
           JOIN users ON users.id = messages.user_id
           WHERE messages.room_id = ? AND messages.kind = 'text'
           ORDER BY messages.created_at DESC, messages.id DESC
           LIMIT ?
         )
         ORDER BY created_at ASC, id ASC`,
      )
      .all(roomId, Math.min(Math.max(limit, 1), 200)) as unknown as MessageRow[];
    return rows.map((row) => this.mapMessage(row));
  }

  private mapMessage(row: MessageRow): ChatMessage {
    return {
      id: row.id,
      roomId: row.room_id,
      user: {
        id: row.user_id,
        username: row.username,
        displayName: row.display_name,
        isAdmin: Boolean(row.is_admin),
      },
      kind: row.kind,
      text: row.text ?? "",
      createdAt: row.created_at,
    };
  }
}
