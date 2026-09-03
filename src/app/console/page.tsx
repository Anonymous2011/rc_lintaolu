import { ConsoleForm } from "./console-form";
import { getI18n } from "@/lib/i18n";

export default async function ConsolePage() {
  const { t } = await getI18n();

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      {/* ---- Reviewer-facing scope note, matching the monitor page. ---- */}
      <aside className="mb-8 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <h2 className="text-base font-semibold text-amber-900">{t.console.bannerTitle}</h2>
        <p className="mt-1.5 text-base leading-relaxed text-amber-900">
          {t.console.bannerBody}
        </p>
      </aside>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t.console.title}</h1>
        <p className="mt-1 max-w-3xl text-base leading-relaxed text-zinc-600">
          {t.console.subtitle}
        </p>
      </header>

      {/* The dictionary slice is plain strings, so it crosses to the client
          component without a serialisation problem. */}
      <ConsoleForm t={t.console} />
    </main>
  );
}
