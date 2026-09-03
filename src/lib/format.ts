import type { Locale } from "./i18n";

/** Compact absolute timestamp. Fixed format, not locale-dependent. */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Relative time, localised.
 *
 * Chinese puts the tense marker after the value (3分钟前 / 5秒后) where English
 * splits it across both sides ("3m ago" / "in 5s"), so this cannot be done by
 * substituting a unit string into a shared template.
 */
export function formatRelative(ms: number, locale: Locale = "en", now = Date.now()): string {
  const delta = now - ms;
  const future = delta < 0;
  const s = Math.round(Math.abs(delta) / 1000);

  if (locale === "zh") {
    const v =
      s < 60 ? `${s}秒` : s < 3600 ? `${Math.round(s / 60)}分钟` : `${Math.round(s / 3600)}小时`;
    return future ? `${v}后` : `${v}前`;
  }

  const v =
    s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
  return future ? `in ${v}` : `${v} ago`;
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Host only — full URLs blow up table layouts and the host is the useful part. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 40);
  }
}
