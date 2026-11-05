import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppDatabase } from "./db.js";
import { hashPassword, tokenHash } from "./auth.js";

describe("application database", () => {
  let directory: string;
  let database: AppDatabase;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "together-screen-db-"));
    database = new AppDatabase(path.join(directory, "test.sqlite"));
  });

  afterEach(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("creates accounts and persists chat messages", () => {
    const user = database.createUser({
      username: "alice",
      displayName: "Alice",
      passwordHash: hashPassword("password123"),
    });
    const message = database.createMessage({
      roomId: "room-2",
      userId: user.id,
      text: "今晚看什么？",
    });

    expect(database.listUsers()).toEqual([user]);
    expect(database.getMessages("room-2")).toEqual([message]);
    expect(message.user.displayName).toBe("Alice");
  });

  it("prevents duplicate usernames case-insensitively", () => {
    database.createUser({
      username: "Alice",
      displayName: "Alice",
      passwordHash: hashPassword("password123"),
    });

    expect(() =>
      database.createUser({
        username: "alice",
        displayName: "Another Alice",
        passwordHash: hashPassword("password123"),
      }),
    ).toThrow(/UNIQUE/);
  });

  it("only returns text messages after file transfer was removed", () => {
    const user = database.createUser({
      username: "bob",
      displayName: "Bob",
      passwordHash: hashPassword("password123"),
    });
    const text = database.createMessage({
      roomId: "room-3",
      userId: user.id,
      text: "保留这条文字消息",
    });
    const createdAt = new Date().toISOString();
    database.db
      .prepare(
        `INSERT INTO attachments
         (id, room_id, uploader_id, original_name, mime_type, byte_size, storage_name, created_at)
         VALUES ('old-file', 'room-3', ?, 'old.zip', 'application/octet-stream', 4, 'old-file', ?)`,
      )
      .run(user.id, createdAt);
    database.db
      .prepare(
        `INSERT INTO messages
         (id, room_id, user_id, kind, text, attachment_id, created_at)
         VALUES ('old-file-message', 'room-3', ?, 'file', NULL, 'old-file', ?)`,
      )
      .run(user.id, createdAt);

    expect(database.getMessages("room-3").map((message) => message.id)).toEqual([text.id]);
  });

  it("invalidates every older session for a user", () => {
    const user = database.createUser({
      username: "single-session",
      displayName: "Single Session",
      passwordHash: hashPassword("password123"),
    });
    const future = new Date(Date.now() + 60_000).toISOString();
    database.createSession(tokenHash("first-token"), user.id, future);
    database.createSession(tokenHash("second-token"), user.id, future);

    database.deleteSessionsForUser(user.id);

    expect(database.getUserBySession(tokenHash("first-token"))).toBeNull();
    expect(database.getUserBySession(tokenHash("second-token"))).toBeNull();
  });
});
