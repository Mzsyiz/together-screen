import { describe, expect, it } from "vitest";
import { hashPassword, tokenHash, verifyPassword } from "./auth.js";

describe("password and session helpers", () => {
  it("hashes passwords with independent salts", () => {
    const first = hashPassword("correct horse battery staple");
    const second = hashPassword("correct horse battery staple");

    expect(first).not.toBe(second);
    expect(verifyPassword("correct horse battery staple", first)).toBe(true);
    expect(verifyPassword("wrong password", first)).toBe(false);
  });

  it("creates a stable opaque token hash", () => {
    expect(tokenHash("token")).toHaveLength(64);
    expect(tokenHash("token")).toBe(tokenHash("token"));
    expect(tokenHash("token")).not.toBe(tokenHash("other"));
  });
});
