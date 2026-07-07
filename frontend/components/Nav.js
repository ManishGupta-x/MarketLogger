"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/stocks", label: "Stocks" },
  { href: "/industries", label: "Industries" },
  { href: "/prompts", label: "Prompts" },
  { href: "/data", label: "Data" },
  { href: "/strategies", label: "Strategies" },
  { href: "/backtests", label: "Backtests" },
  { href: "/paper", label: "Paper" },
  { href: "/trades", label: "Trades" },
  { href: "/broker", label: "Broker" },
  { href: "/risk", label: "Risk" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-black/10 bg-[#fcfcfb]/95 backdrop-blur dark:border-white/10 dark:bg-[#1a1a19]/95">
      <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2.5 text-sm">
        <Link href="/" className="mr-3 shrink-0 font-semibold tracking-tight text-[#0b0b0b] dark:text-white">
          Market
        </Link>
        <nav className="flex items-center gap-0.5">
          {LINKS.slice(1).map((link) => {
            const active = pathname === link.href || (link.href !== "/" && pathname?.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 rounded-md px-2.5 py-1.5 transition-colors ${
                  active
                    ? "bg-[#2a78d6]/10 text-[#2a78d6] dark:bg-[#3987e5]/15 dark:text-[#3987e5]"
                    : "text-[#52514e] hover:bg-black/5 hover:text-[#0b0b0b] dark:text-[#c3c2b7] dark:hover:bg-white/10 dark:hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
