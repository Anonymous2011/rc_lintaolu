/**
 * `register()` runs once per server instance, before any request is served —
 * the only hook Next gives us for starting a long-lived background task.
 */
export async function register(): Promise<void> {
  // Guard against the edge runtime, which has neither SQLite nor timers we can
  // rely on. The worker is a Node-only concern.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startWorker } = await import("./lib/worker");
  startWorker();
}
