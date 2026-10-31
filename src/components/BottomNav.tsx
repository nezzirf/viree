"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Circuit", icon: "M12 3a7 7 0 0 0-7 7c0 5 7 11 7 11s7-6 7-11a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 7.5a2.5 2.5 0 0 1 0 5Z" },
  { href: "/cols", label: "Cols", icon: "M2 20 9 7l4 6 3-4 6 11H2Z" },
  { href: "/sorties", label: "Sorties", icon: "M4 19V9m5 10V5m5 14v-7m5 7V8" },
  { href: "/classement", label: "Classement", icon: "M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v1a3 3 0 0 0 3 3m10-4h3v1a3 3 0 0 1-3 3" },
  { href: "/groupes", label: "À plusieurs", icon: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6m5 16a6 6 0 0 0-4-5.6" },
];

export function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/suivre")) return null; // plein écran en mode guidage
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-night/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${active ? "text-lime" : "text-mute"}`}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={t.icon} />
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
