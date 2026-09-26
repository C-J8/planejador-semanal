"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/acompanhamento", label: "Rotina", exact: true },
  { href: "/acompanhamento/xadrez", label: "Xadrez", exact: false },
] as const;

export function TrackingNavigation() {
  const pathname = usePathname();

  return (
    <nav className="tracking-navigation" aria-label="Áreas de acompanhamento">
      {links.map((link) => {
        const current = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            aria-current={current ? "page" : undefined}
            className={current ? "current" : undefined}
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
