import { getAttempts, getNotification } from "@/lib/queries";
import { toPublicNotification } from "@/lib/api-view";

/**
 * A single notification with its full attempt history.
 *
 * This is an operations endpoint, not part of the calling path: it exists for
 * support tickets, reconciliation jobs and dead-letter triage. Business systems
 * are not meant to poll it after submitting — the whole point of the 202 is
 * that they do not have to.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  const notification = getNotification(id);
  if (!notification) {
    // A stable `code` so callers can branch on the outcome without matching on
    // English prose.
    return Response.json(
      { code: "not_found", message: `no notification with id ${id}` },
      { status: 404 },
    );
  }

  return Response.json(toPublicNotification(notification, getAttempts(id)));
}
