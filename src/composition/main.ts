import { loadConfig } from "#common/config.ts";
import { createApp } from "./app.ts";

const config = loadConfig();

async function start(): Promise<void> {
  if (config.MIGRATE_ON_START) {
    const { migrate } = await import("#infrastructure/persistence/migrate.ts");
    await migrate();
  }
  const { startListener } = await import("#modules/notifications/index.ts");
  await startListener();
  const app = createApp();
  const { mountBullBoard } = await import("#infrastructure/queue/board.ts");
  mountBullBoard(app);
  app.listen(config.PORT, () => {
    console.log(`listening on ${config.PORT}`);
  });
}

try {
  await start();
} catch (err: unknown) {
  console.error(err);
  process.exit(1);
}
