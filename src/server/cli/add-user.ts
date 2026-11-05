import { parseArgs } from "node:util";
import {
  hashPassword,
  validatePassword,
  validateUsername,
} from "../auth.js";
import { appConfig } from "../config.js";
import { AppDatabase } from "../db.js";

const { values } = parseArgs({
  options: {
    username: { type: "string" },
    display: { type: "string" },
    password: { type: "string" },
    admin: { type: "boolean", default: false },
  },
});

const username = String(values.username ?? "").trim();
const displayName = String(values.display ?? username).trim();
const password = String(values.password ?? "");

const usernameError = validateUsername(username);
const passwordError = validatePassword(password);
if (usernameError || passwordError) {
  console.error(usernameError ?? passwordError);
  process.exit(1);
}
if (!displayName || displayName.length > 32) {
  console.error("昵称长度需为 1-32 字");
  process.exit(1);
}

const database = new AppDatabase(appConfig.databasePath);
try {
  const user = database.createUser({
    username,
    displayName,
    passwordHash: hashPassword(password),
    isAdmin: values.admin,
  });
  console.log(
    `已创建${user.isAdmin ? "管理员" : "用户"}：${user.displayName} (${user.username})`,
  );
} catch (error) {
  if (
    error instanceof Error &&
    (error.message.includes("UNIQUE constraint") || error.message.includes("users.username"))
  ) {
    console.error("账号已存在");
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  database.close();
}
