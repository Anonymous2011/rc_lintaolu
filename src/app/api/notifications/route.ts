import { enqueue } from "@/lib/enqueue";
import { getAttempts, getNotificationByIdempotencyKey, listByStatus } from "@/lib/queries";
import { toPublicNotification } from "@/lib/api-view";
import type { NotificationStatus } from "@/lib/types";

const STATUSES = new Set<NotificationStatus>(["pending", "in_flight", "delivered", "dead"]);

/**
 * Operations read endpoint. Two shapes:
 *
 *   ?idempotency_key=...   the caller's own key — no need to have stored our id
 *   ?status=dead&limit=50  the dead-letter list, for triage and alerting
 *
 * Deliberately not a polling endpoint for the submitting path: a business
 * system that polls here has rebuilt the retry bookkeeping the 202 removed.
 */
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;

  const key = q.get("idempotency_key");
  if (key) {
    const found = getNotificationByIdempotencyKey(key);
    if (!found) {
      return Response.json(
        { code: "not_found", message: `no notification with idempotency_key ${key}` },
        { status: 404 },
      );
    }
    return Response.json(toPublicNotification(found, getAttempts(found.id)));
  }

  const status = q.get("status") ?? "dead";
  if (!STATUSES.has(status as NotificationStatus)) {
    return Response.json(
      { code: "invalid_status", field: "status", message: `unknown status ${status}` },
      { status: 400 },
    );
  }

  const limit = Math.min(Math.max(Number(q.get("limit") ?? 50) || 50, 1), 200);
  const rows = listByStatus(status as NotificationStatus, limit);

  // History is omitted from the list: it is unbounded per row, and a triage
  // list wants breadth. Follow the id for detail.
  return Response.json({
    status,
    count: rows.length,
    notifications: rows.map((n) => toPublicNotification(n)),
  });
}

/**
 * Ingress. The only endpoint business systems call.
 *
 * Returns 202, never the vendor's response: the caller is told we have taken
 * ownership, not that the vendor is happy. Waiting for the vendor would couple
 * the caller's latency and availability to the vendor's, which is the exact
 * problem this service exists to remove.
 */
export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "request body must be valid JSON" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "request body must be a JSON object" }, { status: 400 });
  }

  const result = await enqueue(payload);

  if (!result.ok) {
    // 400, not 500: everything enqueue() rejects is a caller-side problem it
    // can fix, and it is fixed far more cheaply now than in a dead letter.
    return Response.json({ error: result.error, field: result.field }, { status: 400 });
  }

  return Response.json(
    { id: result.id, status: result.status, duplicate: result.duplicate },
    {
      // 200 for a duplicate makes the idempotency outcome visible to the
      // caller without making it an error: the work is already accepted.
      status: result.duplicate ? 200 : 202,
      // The monitor has no per-notification view yet, so this points at the
      // list rather than promising a deep link that 404s in spirit.
      headers: { Location: "/monitor" },
    },
  );
}
