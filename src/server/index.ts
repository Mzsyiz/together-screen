import { buildApp } from "./app.js";
import { appConfig } from "./config.js";

const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: appConfig.port, host: appConfig.host });
app.log.info(`Together Screen listening on http://localhost:${appConfig.port}`);
