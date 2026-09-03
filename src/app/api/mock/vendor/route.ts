/**
 * A stand-in for an external vendor API, with switchable failure behaviour.
 *
 * Retry logic that has never failed is untested logic. Pointing the console at
 * a real endpoint demonstrates the happy path only; this endpoint is how the
 * backoff curve, the retryable/terminal split and the dead-letter path become
 * observable in under a minute.
 *
 *   ?mode=ok                          always 200
 *   ?mode=fail&status=500             always that status
 *   ?mode=flaky&fail_times=2&key=abc  fails N times per key, then 200
 *   ?mode=slow&delay_ms=15000         responds late, to trigger our timeout
 *   ?mode=ratelimit&fail_times=1      429 + Retry-After, then 200
 */

declare global {
  var __mockVendorHits: Map<string, number> | undefined;
}

// Survives hot reload so a "fail twice then succeed" run is not reset by an
// unrelated edit mid-experiment.
const hits = (globalThis.__mockVendorHits ??= new Map<string, number>());

function handle(request: Request): Response {
  const q = new URL(request.url).searchParams;
  const mode = q.get("mode") ?? "ok";
  const key = q.get("key") ?? "default";

  if (q.get("reset") === "1") {
    hits.delete(key);
    return Response.json({ ok: true, reset: key });
  }

  const seen = (hits.get(key) ?? 0) + 1;
  hits.set(key, seen);

  const failTimes = Number(q.get("fail_times") ?? 2);
  const base = { mode, key, hit: seen, at: new Date().toISOString() };

  switch (mode) {
    case "fail": {
      const status = Number(q.get("status") ?? 500);
      return Response.json({ ...base, error: "simulated vendor failure" }, { status });
    }

    case "flaky": {
      if (seen <= failTimes) {
        return Response.json(
          { ...base, error: `simulated failure ${seen} of ${failTimes}` },
          { status: Number(q.get("status") ?? 503) },
        );
      }
      return Response.json({ ...base, recovered_after: failTimes });
    }

    case "ratelimit": {
      if (seen <= failTimes) {
        return Response.json(
          { ...base, error: "rate limited" },
          { status: 429, headers: { "Retry-After": q.get("retry_after") ?? "5" } },
        );
      }
      return Response.json(base);
    }

    case "slow": {
      const delay = Number(q.get("delay_ms") ?? 15_000);
      return new Response(JSON.stringify({ ...base, delayed_ms: delay }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    default:
      return Response.json(base);
  }
}

async function withDelay(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  if (q.get("mode") === "slow") {
    const delay = Math.min(Number(q.get("delay_ms") ?? 15_000), 60_000);
    await new Promise((r) => setTimeout(r, delay));
  }
  return handle(request);
}

export const POST = withDelay;
export const PUT = withDelay;
export const PATCH = withDelay;
export const DELETE = withDelay;
export const GET = withDelay;
