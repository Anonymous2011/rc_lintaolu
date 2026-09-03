"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  POLICIES,
  POLICY_NAMES,
  formatSpan,
  schedulePreviewMs,
  totalSpanMs,
  type PolicyName,
} from "@/lib/policy";
import { PRESETS, resolvePresetUrl, type Preset } from "@/lib/presets";
import type { Dictionary } from "@/lib/i18n";

type ConsoleDict = Dictionary["console"];

interface HeaderRow {
  id: number;
  name: string;
  value: string;
}

interface SubmitResult {
  ok: boolean;
  id?: string;
  duplicate?: boolean;
  error?: string;
  field?: string;
  httpStatus: number;
}

const METHODS = ["POST", "PUT", "PATCH", "DELETE", "GET"];

let headerId = 0;
const toRows = (headers: Record<string, string>): HeaderRow[] =>
  Object.entries(headers).map(([name, value]) => ({ id: headerId++, name, value }));

const field =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-base outline-none focus:border-zinc-400";
const label = "block text-sm font-medium text-zinc-600";

export function ConsoleForm({ t }: { t: ConsoleDict }) {
  const [source, setSource] = useState("signup-service");
  const [eventType, setEventType] = useState("user.registered");
  const [method, setMethod] = useState("POST");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<HeaderRow[]>(
    toRows({ "Content-Type": "application/json" }),
  );
  const [body, setBody] = useState('{\n  "hello": "world"\n}');
  const [policy, setPolicy] = useState<PolicyName>("standard");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  // Built from the policy definition rather than written out in the
  // dictionary: hardcoded spans were wrong by an order of magnitude the first
  // time these numbers changed.
  function policyLabel(name: PolicyName): string {
    const p = POLICIES[name];
    if (p.maxAttempts === 1) return `${name} — ${t.policyOnce}`;
    return `${name} — ${p.maxAttempts} × ${formatSpan(totalSpanMs(p))}`;
  }

  const presetLabels: Record<string, { name: string; desc: string }> = {
    ads: { name: t.presetAds, desc: t.presetAdsDesc },
    crm: { name: t.presetCrm, desc: t.presetCrmDesc },
    inventory: { name: t.presetInventory, desc: t.presetInventoryDesc },
    outage: { name: t.presetOutage, desc: t.presetOutageDesc },
    badrequest: { name: t.presetBadrequest, desc: t.presetBadrequestDesc },
    ratelimit: { name: t.presetRatelimit, desc: t.presetRatelimitDesc },
    timeout: { name: t.presetTimeout, desc: t.presetTimeoutDesc },
    ssrf: { name: t.presetSsrf, desc: t.presetSsrfDesc },
  };

  const schedule = useMemo(() => schedulePreviewMs(POLICIES[policy]), [policy]);

  // Whether the body parses is only advisory: the service sends it verbatim
  // either way, because a vendor is free to want form-encoded or XML.
  const bodyIsJson = useMemo(() => {
    if (body.trim() === "") return true;
    try {
      JSON.parse(body);
      return true;
    } catch {
      return false;
    }
  }, [body]);

  function applyPreset(p: Preset) {
    setSource(p.source);
    setEventType(p.event_type);
    setMethod(p.method);
    setUrl(resolvePresetUrl(p.url, window.location.origin));
    setHeaders(toRows(p.headers));
    setBody(JSON.stringify(p.body, null, 2));
    setPolicy(p.policy);
    setIdempotencyKey("");
    setResult(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setResult(null);

    const headerObject: Record<string, string> = {};
    for (const h of headers) {
      if (h.name.trim()) headerObject[h.name.trim()] = h.value;
    }

    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          event_type: eventType,
          method,
          target_url: url,
          headers: headerObject,
          body: body.trim() === "" ? null : body,
          policy,
          idempotency_key: idempotencyKey.trim() || null,
        }),
      });
      const json = await res.json();
      setResult({ ok: res.ok, httpStatus: res.status, ...json });
    } catch (err) {
      setResult({ ok: false, httpStatus: 0, error: String(err) });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* ---------------- Examples ---------------- */}
      <aside>
        <h2 className="mb-1 text-base font-semibold">{t.examples}</h2>
        <p className="mb-3 text-sm leading-relaxed text-zinc-600">{t.mockNote}</p>
        <div className="grid gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-left transition-colors hover:bg-zinc-50"
            >
              <span className="block text-sm font-medium">{presetLabels[p.id].name}</span>
              <span className="mt-0.5 block text-sm text-zinc-600">
                {presetLabels[p.id].desc}
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* ---------------- Request builder ---------------- */}
      <form onSubmit={submit} className="grid gap-5">
        <section className="grid gap-3 rounded-lg border border-zinc-200 bg-white shadow-sm p-4">
          <h2 className="text-base font-semibold">{t.request}</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="source">
                {t.fieldSource}
              </label>
              <input
                id="source"
                className={field}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={label} htmlFor="event">
                {t.fieldEvent}
              </label>
              <input
                id="event"
                className={field}
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex gap-2">
            <div className="w-28">
              <label className={label} htmlFor="method">
                {t.fieldMethod}
              </label>
              <select
                id="method"
                className={field}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className={label} htmlFor="url">
                {t.fieldUrl}
              </label>
              <input
                id="url"
                className={`${field} font-mono`}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://vendor.example.com/webhook"
                required
              />
            </div>
          </div>

          <div>
            <span className={label}>{t.fieldHeaders}</span>
            <div className="mt-1 grid gap-1.5">
              {headers.map((h) => (
                <div key={h.id} className="flex gap-1.5">
                  <input
                    aria-label={t.headerName}
                    className={`${field} font-mono`}
                    placeholder={t.headerName}
                    value={h.name}
                    onChange={(e) =>
                      setHeaders((rows) =>
                        rows.map((r) => (r.id === h.id ? { ...r, name: e.target.value } : r)),
                      )
                    }
                  />
                  <input
                    aria-label={t.headerValue}
                    className={`${field} font-mono`}
                    placeholder={t.headerValue}
                    value={h.value}
                    onChange={(e) =>
                      setHeaders((rows) =>
                        rows.map((r) => (r.id === h.id ? { ...r, value: e.target.value } : r)),
                      )
                    }
                  />
                  <button
                    type="button"
                    aria-label={t.removeHeader}
                    onClick={() => setHeaders((rows) => rows.filter((r) => r.id !== h.id))}
                    className="shrink-0 rounded-md border border-zinc-300 px-2 text-base text-zinc-600 hover:bg-zinc-100"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setHeaders((rows) => [...rows, { id: headerId++, name: "", value: "" }])
                }
                className="justify-self-start rounded-md border border-zinc-300 px-2.5 py-1 text-sm font-medium hover:bg-zinc-100"
              >
                {t.addHeader}
              </button>
            </div>
          </div>

          <div>
            <label className={label} htmlFor="body">
              {t.fieldBody}
            </label>
            <textarea
              id="body"
              rows={8}
              className={`${field} font-mono`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck={false}
            />
            {!bodyIsJson && <p className="mt-1 text-sm text-amber-700">{t.invalidJson}</p>}
          </div>

          <div>
            <label className={label} htmlFor="idem">
              {t.fieldIdempotency}
            </label>
            <input
              id="idem"
              className={`${field} font-mono`}
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              placeholder="order-55021-inventory"
            />
            <p className="mt-1 text-sm text-zinc-600">{t.idempotencyHint}</p>
          </div>
        </section>

        {/* ---------------- Delivery policy ---------------- */}
        <section className="grid gap-3 rounded-lg border border-zinc-200 bg-white shadow-sm p-4">
          <h2 className="text-base font-semibold">{t.delivery}</h2>

          <div>
            <label className={label} htmlFor="policy">
              {t.fieldPolicy}
            </label>
            <select
              id="policy"
              className={field}
              value={policy}
              onChange={(e) => setPolicy(e.target.value as PolicyName)}
            >
              {POLICY_NAMES.map((name) => (
                <option key={name} value={name}>
                  {policyLabel(name)}
                </option>
              ))}
            </select>
          </div>

          {/* Showing the schedule turns an abstract policy name into a
              commitment the operator can actually evaluate. */}
          <div>
            <span className={label}>{t.schedule}</span>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {schedule.map((offset, i) => (
                <span
                  key={i}
                  className="rounded border border-zinc-300 px-1.5 py-0.5 font-mono text-sm text-zinc-600"
                >
                  #{i + 1} +{formatSpan(offset)}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-sm text-zinc-600">
              {t.scheduleHint} · {t.timeoutLabel}: {formatSpan(POLICIES[policy].timeoutMs)}
            </p>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-3.5 py-2 text-base font-medium text-white transition-opacity disabled:opacity-50"
          >
            {pending ? t.sending : t.send}
          </button>

          {result && (
            <div className="flex flex-wrap items-center gap-2 text-base">
              <span
                className={`rounded-full px-2 py-0.5 text-sm font-medium ring-1 ring-inset ${
                  result.ok
                    ? "bg-emerald-500/15 text-emerald-800 ring-emerald-500/20"
                    : "bg-red-500/15 text-red-800 ring-red-500/20"
                }`}
              >
                HTTP {result.httpStatus}
              </span>
              <span className="text-zinc-600">
                {result.ok
                  ? result.duplicate
                    ? t.duplicate
                    : t.accepted
                  : `${t.rejected}: ${result.error ?? ""}`}
              </span>
              {result.id && (
                <>
                  <code className="font-mono text-sm text-zinc-600">{result.id}</code>
                  <Link
                    href="/monitor"
                    className="text-sm font-medium underline underline-offset-2"
                  >
                    {t.viewInMonitor}
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
