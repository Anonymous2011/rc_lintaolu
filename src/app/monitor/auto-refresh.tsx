"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls the server component tree on an interval.
 *
 * Polling is the honest choice here: delivery state changes on a background
 * worker with no push channel to the browser, and a review UI does not justify
 * an SSE/WebSocket transport. Named as a limitation in the page banner.
 *
 * Labels are passed in rather than looked up, because the dictionary is only
 * resolvable on the server.
 */
export function AutoRefresh({
  seconds = 5,
  liveLabel,
  pausedLabel,
}: {
  seconds?: number;
  liveLabel: string;
  pausedLabel: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(true);

  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [on, seconds, router]);

  return (
    <button
      onClick={() => setOn((v) => !v)}
      className="flex items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-1 text-sm font-medium transition-colors hover:bg-zinc-100"
    >
      <span className={`size-1.5 rounded-full ${on ? "bg-emerald-500" : "bg-zinc-400"}`} />
      {on ? liveLabel : pausedLabel}
    </button>
  );
}
