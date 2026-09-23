import { openDatabase } from "./db.js";
import { runDueCaptures } from "./monitoring.js";
import { buildApp } from "./app.js";

if (process.env.NODE_ENV === "production" && !process.env.PUBLIC_ORIGIN)
  throw new Error(
    "Set PUBLIC_ORIGIN to the HTTPS deployment origin before starting production.",
  );
if (process.env.NODE_ENV === "production") {
  const publicUrl = new URL(process.env.PUBLIC_ORIGIN!);
  if (
    publicUrl.protocol !== "https:" ||
    publicUrl.origin !== process.env.PUBLIC_ORIGIN
  )
    throw new Error(
      "PUBLIC_ORIGIN must be an exact HTTPS origin without a path, credentials or trailing slash.",
    );
}
const db = openDatabase();
const app = await buildApp({ logger: true, db });
let monitorPromise: Promise<void> | null = null;
const monitorTick = () => {
  if (monitorPromise) return;
  monitorPromise = runDueCaptures(db)
    .then(() => {})
    .catch((error) =>
      app.log.error({ err: error }, "Scheduled capture tick failed"),
    )
    .finally(() => {
      monitorPromise = null;
    });
};
const monitorTimer = setInterval(monitorTick, 60000);
monitorTimer.unref();
monitorTick();
app.addHook("onClose", async () => {
  clearInterval(monitorTimer);
  if (monitorPromise) await monitorPromise;
  if (db.open) db.close();
});
try {
  await app.listen({
    port: Number(process.env.PORT) || 3001,
    host: process.env.HOST || "0.0.0.0",
  });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await app.close();
}
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void app.close().then(() => process.exit(0));
  });
