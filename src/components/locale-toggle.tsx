import { setLocale } from "@/lib/locale-action";
import { type Locale } from "@/lib/i18n";

const LABEL: Record<Locale, string> = { en: "EN", zh: "中文" };

/**
 * Plain form posting to a Server Action — no client JS, so the toggle works
 * before hydration and cannot desync from what the server rendered.
 */
export function LocaleToggle({ locale }: { locale: Locale }) {
  return (
    <form
      action={setLocale}
      className="inline-flex overflow-hidden rounded-md border border-zinc-300"
    >
      {(Object.keys(LABEL) as Locale[]).map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="submit"
            name="locale"
            value={l}
            aria-current={active ? "true" : undefined}
            className={`px-2.5 py-1 text-sm font-medium transition-colors ${
              active
                ? "bg-zinc-900 text-white"
                : "hover:bg-zinc-100"
            }`}
          >
            {LABEL[l]}
          </button>
        );
      })}
    </form>
  );
}
