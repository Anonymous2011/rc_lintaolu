import Link from "next/link";
import { ArchitectureDiagram } from "@/components/diagrams";
import { CodeBlock } from "@/components/code-block";
import { getSnippet } from "@/lib/snippets";
import { getI18n } from "@/lib/i18n";
import {
  POLICIES,
  POLICY_NAMES,
  formatSpan,
  totalSpanMs,
  type PolicyName,
} from "@/lib/policy";

function Section({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="border-t border-zinc-200 pt-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {body && (
        <p className="mt-2 max-w-3xl text-base leading-relaxed text-zinc-600">
          {body}
        </p>
      )}
      {children}
    </section>
  );
}

export default async function Home() {
  const { t } = await getI18n();
  const o = t.overview;

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{o.heroTitle}</h1>
        {/* The pages are a demonstration surface; the service itself is an API.
            Saying so up front stops the UI being mistaken for the deliverable. */}
        <p className="mt-2 max-w-3xl text-base leading-relaxed text-zinc-600">{o.heroNote}</p>

        <p className="mt-5 text-sm font-medium text-zinc-700">{o.heroExampleLabel}</p>

        <p className="mt-2 text-sm text-zinc-600">{o.heroRequestLabel}</p>
        <div className="mt-1 overflow-x-auto rounded-md bg-white">
          <pre className="px-3 py-2.5 font-mono text-xs leading-relaxed">
            <code>{`POST /api/notifications
Content-Type: application/json

{
  "source":     "signup-service",
  "event_type": "user.registered",
  "target_url": "https://ads.partner.example.com/v2/conversions",
  "headers":    { "X-Api-Key": "..." },
  "body":       { "click_id": "gclid_8823a" }
}`}</code>
          </pre>
        </div>

        <p className="mt-3 text-sm text-zinc-600">{o.heroResponseLabel}</p>
        <div className="mt-1 overflow-x-auto rounded-md bg-white">
          <pre className="px-3 py-2.5 font-mono text-xs leading-relaxed">
            <code>{`202 Accepted

{ "id": "ntf_mtm82n42m3w4nqyk", "status": "pending", "duplicate": false }`}</code>
          </pre>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/console"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            {t.nav.console} →
          </Link>
          <Link
            href="/monitor"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100"
          >
            {t.nav.monitor} →
          </Link>
        </div>
      </header>

      <Section title={o.boundaryTitle} body={o.boundaryBody}>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white shadow-sm p-4">
            <h3 className="text-sm font-semibold">{o.inScopeTitle}</h3>
            <ul className="mt-2 grid gap-2.5">
              {o.inScope.map((item) => (
                <li key={item.title}>
                  <span className="flex items-baseline gap-1.5 text-sm font-medium">
                    <span className="text-emerald-500">✓</span>
                    {item.title}
                  </span>
                  <p className="mt-0.5 pl-4 text-sm leading-relaxed text-zinc-600">
                    {item.why}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white shadow-sm p-4">
            <h3 className="text-sm font-semibold">{o.outScopeTitle}</h3>
            <ul className="mt-2 grid gap-2.5">
              {o.outScope.map((item) => (
                <li key={item.title}>
                  <span className="text-sm font-medium">{item.title}</span>
                  <p className="mt-0.5 text-sm leading-relaxed text-zinc-600">{item.why}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section title={o.archTitle} body={o.archBody}>
        <div className="mt-5 rounded-lg border border-zinc-200 bg-white shadow-sm p-4">
          <ArchitectureDiagram t={o} />
        </div>
      </Section>

      <Section title={o.storageTitle} body={o.storageBody}>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {o.storage.map((item) => (
            <div key={item.title} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600">{item.why}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title={o.glossaryTitle} body={o.glossaryBody}>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {[
            { title: o.glossaryStatesTitle, items: o.glossaryStates },
            { title: o.glossaryMechanismsTitle, items: o.glossaryMechanisms },
          ].map((group) => (
            <div
              key={group.title}
              className="rounded-lg border border-zinc-200 bg-white shadow-sm p-4"
            >
              <h3 className="text-sm font-semibold text-zinc-600">
                {group.title}
              </h3>
              <dl className="mt-3 grid gap-3">
                {group.items.map((item) => (
                  <div key={item.term}>
                    <dt className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-semibold">{item.term}</span>
                      {/* The database value, so the UI label and the data line up. */}
                      <code className="font-mono text-sm text-zinc-500">{item.code}</code>
                    </dt>
                    <dd className="mt-0.5 text-sm leading-relaxed text-zinc-600">{item.def}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </Section>

      <Section title={o.classifyTitle} body={o.classifyBody}>
        <div className="mt-5 overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[560px] text-base">
            <thead className="text-sm text-zinc-600">
              <tr className="border-b border-zinc-200">
                <th className="px-4 py-2 text-left font-medium">{o.classifyCols.signal}</th>
                <th className="px-4 py-2 text-left font-medium">{o.classifyCols.decision}</th>
                <th className="px-4 py-2 text-left font-medium">{o.classifyCols.why}</th>
              </tr>
            </thead>
            <tbody>
              {o.classifyRows.map((row) => (
                <tr key={row.signal} className="border-t border-zinc-200">
                  <td className="px-4 py-2 font-mono text-sm whitespace-nowrap">{row.signal}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-sm font-medium ${
                        row.retry
                          ? "bg-amber-500/15 text-amber-800"
                          : "bg-zinc-500/10 text-zinc-600"
                      }`}
                    >
                      {row.retry ? o.classifyRetry : o.classifyStop}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm leading-relaxed text-zinc-600">
                    {row.why}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={o.policyTitle} body={o.policyBody}>
        <div className="mt-5 overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[620px] text-base">
            <thead className="text-sm text-zinc-600">
              <tr className="border-b border-zinc-200">
                <th className="px-4 py-2 text-left font-medium">{o.policyCols.name}</th>
                <th className="px-4 py-2 text-right font-medium">{o.policyCols.attempts}</th>
                <th className="px-4 py-2 text-right font-medium">{o.policyCols.span}</th>
                <th className="px-4 py-2 text-right font-medium">{o.policyCols.timeout}</th>
                <th className="px-4 py-2 text-left font-medium">{o.policyCols.use}</th>
              </tr>
            </thead>
            <tbody>
              {POLICY_NAMES.map((name: PolicyName) => {
                const p = POLICIES[name];
                return (
                  <tr key={name} className="border-t border-zinc-200">
                    <td className="px-4 py-2 font-mono text-sm">{name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{p.maxAttempts}</td>
                    {/* Computed, never transcribed — see policy.ts totalSpanMs. */}
                    <td className="px-4 py-2 text-right tabular-nums">
                      {p.maxAttempts === 1 ? "—" : formatSpan(totalSpanMs(p))}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatSpan(p.timeoutMs)}
                    </td>
                    <td className="px-4 py-2 text-sm text-zinc-600">
                      {o.policyUse[name]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={o.codeTitle} body={o.codeBody}>
        <h3 className="mt-5 text-sm font-semibold text-zinc-600">
          {o.codeSchemaTitle}
        </h3>
        <div className="mt-2 grid gap-4">
          <CodeBlock
            file="src/lib/db.ts"
            code={getSnippet("src/lib/db.ts", "notifications")}
            caption={o.codeSchemaNotifications}
          />
          <CodeBlock
            file="src/lib/db.ts"
            code={getSnippet("src/lib/db.ts", "attempts")}
            caption={o.codeSchemaAttempts}
          />
        </div>

      </Section>

    </main>
  );
}
