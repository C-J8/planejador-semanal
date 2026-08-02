"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dia", label: "Dia" },
  { href: "/semana", label: "Semana" },
  { href: "/mes", label: "Mês" },
  { href: "/atividades", label: "Atividades" },
  { href: "/acompanhamento", label: "Acompanhamento" },
];

export function Navigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegação principal">
      {links.map((link) => {
        const current =
          pathname === link.href || pathname.startsWith(`${link.href}/`);
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
