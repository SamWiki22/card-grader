import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";

// App-style shell for the Packs section: dark full-bleed background, centered
// phone-width column, and a bottom tab bar.
const TABS = [
  { href: "/packs", label: "Packs", match: p => p === "/packs", icon: <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 0v20M3 7l9 5 9-5" /> },
  { href: "/vault", label: "Vault", match: p => p === "/vault", icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="12" r="4" /><path d="M12 10v2l1.5 1" /></> },
  { href: "/packs/rules", label: "Odds", match: p => p === "/packs/rules", icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
  { href: "/account", label: "Profile", match: p => p === "/account", icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></> },
  { href: "/", label: "Shop", match: () => false, icon: <><path d="M3 9h18l-2 11H5L3 9Z" /><path d="M8 9V7a4 4 0 0 1 8 0v2" /></> },
];

export default function AppShell({ title, children, bar }) {
  const { pathname } = useRouter();
  return (
    <div className="app">
      <Head>
        <title>{title ? `${title} · Bearded Bear Packs` : "Bearded Bear Packs"}</title>
        <meta name="theme-color" content="#0b1426" />
        <meta name="description" content="Open Bearded Bear digital packs and pull real graded cards — keep them, ship them, or sell them back instantly." />
      </Head>
      <div className="app-glow" aria-hidden="true" />
      <main className={`app-main${bar ? " has-bar" : ""}`}>{children}</main>
      {bar}
      <nav className="tabbar" aria-label="Packs navigation">
        <div className="tabbar-inner">
          {TABS.map(t => {
            const on = t.match(pathname);
            return (
              <Link key={t.label} href={t.href} className={`tab${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
                <span className="tab-icon">
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
                </span>
                <span className="tab-label">{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
