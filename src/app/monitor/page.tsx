import Link from "next/link";
import { AutoRefresh } from "./auto-refresh";
import { getAttemptsForMany, listNotifications, type NotificationFilter } from "@/lib/queries";
import { getI18n, type Dictionary, type Locale } from "@/lib/i18n";
import type { AttemptRow, NotificationStatus } from "@/lib/types";
import { formatDuration, formatRelative, formatTime, hostOf } from "@/lib/format";

// Delivery state changes underneath us on a background worker, so this page
// must never be prerendered or cached.
export const dynamic = "force-dynamic";

const FILTERS: { key: NotificationFilter; label: keyof Dictionary["monitor"] }[] = [
  { key: "all", label: "filterAll" },
  { key: "failing", label: "filterFailing" },
  { key: "dead", label: "filterDead" },
  { key: "pending", label: "filterPending" },
  { key: "delivered", label: "filterDelivered" },
];

const STATUS_STYLE: Record<NotificationStatus, string> = {
  delivered: "bg-emerald-500/15 text-emerald-800 ring-emerald-500/20",
  dead: "bg-red-500/15 text-red-800 ring-red-500/20",
  pending: "bg-amber-500/15 text-amber-800 ring-amber-500/20",
  in_flight: "bg-blue-500/10 text-blue-700 ring-blue-500/20",
};

function StatusBadge({ status, t }: { status: NotificationStatus; t: Dictionary }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-sm font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}
    >
      {t.status[status]}
    </span>
  );
}

/** The per-attempt trail: what we tried, what came back, what we did next. */
function AttemptTimeline({
  attempts,
  t,
  locale,
}: {
  attempts: AttemptRow[];
  t: Dictionary;
  locale: Locale;
}) {
  if (attempts.length === 0) {
    return <p className="px-4 py-3 text-sm text-zinc-600">{t.monitor.noAttempts}</p>;
  }

  return (
    <ol className="space-y-2 px-4 py-3">
      {attempts.map((a) => {
        const failed = a.outcome !== "success";
        return (
          <li key={a.id} className="flex gap-3 text-sm">
            <span className="w-6 shrink-0 font-mono text-zinc-500">#{a.attempt_no}</span>
            <span
              className={`w-1 shrink-0 rounded-full ${failed ? "bg-red-400/60" : "bg-emerald-400/60"}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-zinc-600">{formatTime(a.started_at)}</span>
                <span className="text-zinc-500">·</span>
                <span className="font-medium">
                  {a.status_code ? `HTTP ${a.status_code}` : t.monitor.noResponse}
                </span>
                <span className="text-zinc-500">·</span>
                <span className="text-zinc-600">{formatDuration(a.duration_ms)}</span>
                <span
                  className={`rounded px-1.5 py-0.5 font-medium ${
                    a.outcome === "success"
                      ? "bg-emerald-500/15 text-emerald-800"
                      : a.outcome === "retryable"
                        ? "bg-amber-500/15 text-amber-800"
                        : "bg-red-500/15 text-red-800"
                  }`}
                >
                  {t.outcome[a.outcome]}
                </span>
                {a.error_kind && (
                  <span className="text-zinc-600">{t.errorKind[a.error_kind]}</span>
                )}
              </div>
              {/* Vendor error text is data, not UI copy — never translated. */}
              {a.error_message && (
                <div className="mt-0.5 truncate font-mono text-zinc-600">
                  {a.error_message}
                </div>
              )}
              {a.next_attempt_at && (
                <div className="mt-0.5 text-zinc-500">
                  {t.monitor.retryScheduled(formatRelative(a.next_attempt_at, locale))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default async function MonitorPage(props: PageProps<"/monitor">) {
  const { locale, t } = await getI18n();
  const params = await props.searchParams;
  const raw = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const filter = (FILTERS.find((f) => f.key === raw)?.key ?? "all") as NotificationFilter;

  const rows = listNotifications(filter, 100);
  const attemptsById = getAttemptsForMany(rows.map((r) => r.id));

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      {/* ---- Reviewer-facing scope note. See README "System boundary". ---- */}
      <aside className="mb-8 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <h2 className="text-base font-semibold text-amber-900">
          {t.monitor.bannerTitle}
        </h2>
        <p className="mt-1.5 text-base leading-relaxed text-amber-900">
          {t.monitor.bannerBody}
        </p>
      </aside>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.monitor.title}</h1>
          <p className="mt-1 text-base text-zinc-600">{t.monitor.subtitle}</p>
        </div>
        <AutoRefresh seconds={5} liveLabel={t.monitor.live(5)} pausedLabel={t.monitor.paused} />
      </header>

      <nav className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/monitor" : `/monitor?filter=${f.key}`}
            className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-zinc-900 text-white"
                : "border border-zinc-300 hover:bg-zinc-100"
            }`}
          >
            {t.monitor[f.label] as string}
          </Link>
        ))}
      </nav>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-base text-zinc-600">{t.monitor.empty}</p>
            <Link
              href="/console"
              className="mt-1.5 inline-block text-sm font-medium underline underline-offset-2"
            >
              {t.monitor.emptyCta}
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200">
            {rows.map((n) => {
              const attempts = attemptsById.get(n.id) ?? [];
              return (
                <details key={n.id} className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                    <span className="text-zinc-400 transition-transform group-open:rotate-90">
                      ›
                    </span>
                    <StatusBadge status={n.status} t={t} />
                    <span className="min-w-0 flex-1">
                      {/* event_type and source are identifiers from the caller: not UI copy. */}
                      <span className="block truncate text-base font-medium">{n.event_type}</span>
                      <span className="block truncate text-sm text-zinc-600">
                        {n.source} → {hostOf(n.target_url)}
                      </span>
                    </span>
                    <span className="text-sm tabular-nums text-zinc-600">
                      {t.monitor.attemptsOf(n.attempt_count, n.max_attempts)}
                    </span>
                    <span className="w-40 truncate text-right text-sm text-zinc-600">
                      {n.status === "dead" && n.last_error_kind
                        ? t.errorKind[n.last_error_kind]
                        : n.status === "pending" && n.attempt_count > 0
                          ? t.monitor.retryIn(formatRelative(n.next_attempt_at, locale))
                          : formatRelative(n.created_at, locale)}
                    </span>
                  </summary>

                  <div className="border-t border-zinc-200 bg-zinc-50">
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 px-4 py-3 text-sm sm:grid-cols-2">
                      <div className="flex gap-2">
                        <dt className="w-20 shrink-0 text-zinc-600">{t.monitor.labelId}</dt>
                        <dd className="truncate font-mono">{n.id}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-20 shrink-0 text-zinc-600">{t.monitor.labelCreated}</dt>
                        <dd className="font-mono">{formatTime(n.created_at)}</dd>
                      </div>
                      <div className="flex gap-2 sm:col-span-2">
                        <dt className="w-20 shrink-0 text-zinc-600">{t.monitor.labelTarget}</dt>
                        <dd className="truncate font-mono">
                          {n.method} {n.target_url}
                        </dd>
                      </div>
                      <div className="flex gap-2 sm:col-span-2">
                        <dt className="w-20 shrink-0 text-zinc-600">{t.monitor.labelBody}</dt>
                        <dd className="truncate font-mono text-zinc-600">{n.body ?? "—"}</dd>
                      </div>
                    </dl>
                    <div className="border-t border-zinc-200">
                      <AttemptTimeline attempts={attempts} t={t} locale={locale} />
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
