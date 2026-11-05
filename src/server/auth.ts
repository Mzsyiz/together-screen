import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { PublicUser } from "../shared/types.js";
import type { AppDatabase } from "./db.js";

export const SESSION_COOKIE = "together_session";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, expectedHex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getRequestUser(db: AppDatabase, request: FastifyRequest): PublicUser | null {
  const token = request.cookies?.[SESSION_COOKIE];
  return token ? db.getUserBySession(tokenHash(token)) : null;
}

export function validateUsername(username: string): string | null {
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return "账号需为 3-32 位字母、数字、下划线、点或短横线";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8 || password.length > 128) {
    return "密码长度需为 8-128 位";
  }
  return null;
}
