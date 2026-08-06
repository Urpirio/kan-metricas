import Link from "next/link";
import { t } from "@lingui/core/macro";

/**
 * Two-column shell shared by the login and sign-up screens.
 *
 * The left column hosts the form; the right column is a decorative brand panel
 * that is hidden below `lg` (rather than stacked) so the form stays the first
 * thing users reach on small screens.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const stats = [
    { value: "12", label: t`Active boards` },
    { value: "248", label: t`Tasks completed` },
    { value: "8", label: t`Team members` },
  ];

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <div className="flex w-full flex-1 items-center justify-center bg-cream px-6 py-12 dark:bg-dark-50 lg:px-16">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-10 inline-flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500 text-[15px] font-bold text-white"
            >
              M
            </span>
            <span className="text-[17px] font-bold tracking-[0.12em] text-brand-800 dark:text-dark-1000">
              METRICAS
            </span>
          </Link>

          {children}
        </div>
      </div>

      <div
        aria-hidden="true"
        className="hidden w-full flex-1 flex-col justify-center bg-brand-800 px-16 py-12 lg:flex"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent-500">
          {t`Project management`}
        </p>
        <h2 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-white">
          {t`Every project,`}
          <br />
          <span className="text-accent-500">{t`under control`}</span>.
        </h2>
        <p className="mt-6 max-w-md text-sm leading-relaxed text-brand-200">
          {t`Organise boards, track progress and keep your team aligned from a single place.`}
        </p>

        <dl className="mt-10 flex gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-brand-700 bg-brand-900/50 px-5 py-3"
            >
              <dt className="sr-only">{stat.label}</dt>
              <dd>
                <span className="block text-xl font-bold text-white">
                  {stat.value}
                </span>
                <span className="mt-1 block text-[10px] uppercase tracking-[0.14em] text-brand-300">
                  {stat.label}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </main>
  );
}
