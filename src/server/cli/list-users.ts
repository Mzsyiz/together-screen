import { appConfig } from "../config.js";
import { AppDatabase } from "../db.js";

const database = new AppDatabase(appConfig.databasePath);
try {
  const users = database.listUsers();
  if (!users.length) {
    console.log("暂无用户。使用 npm run user:add -- --username alice --display Alice --password '至少8位密码'");
  } else {
    for (const user of users) {
      console.log(
        `${user.username.padEnd(20)} ${user.displayName}${user.isAdmin ? " [管理员]" : ""}`,
      );
    }
  }
} finally {
  database.close();
}
