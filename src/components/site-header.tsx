import Link from "next/link";
import { LocaleToggle } from "./locale-toggle";
import { getI18n } from "@/lib/i18n";

export async function SiteHeader() {
  const { locale, t } = await getI18n();

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-3">
        <Link href="/" className="text-base font-semibold tracking-tight">
          {t.brand}
        </Link>
        <nav className="flex gap-4 text-base text-zinc-600">
          <Link href="/" className="hover:text-zinc-900">
            {t.nav.overview}
          </Link>
          <Link href="/console" className="hover:text-zinc-900">
            {t.nav.console}
          </Link>
          <Link href="/monitor" className="hover:text-zinc-900">
            {t.nav.monitor}
          </Link>
        </nav>
        <div className="ml-auto">
          <LocaleToggle locale={locale} />
        </div>
      </div>
    </header>
  );
}
