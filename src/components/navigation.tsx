"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const viewLinks = [
  { href: "/dia", label: "Dia" },
  { href: "/semana", label: "Semana" },
  { href: "/mes", label: "Mês" },
];

const resourceLinks = [
  { href: "/atividades", label: "Atividades" },
  { href: "/acompanhamento", label: "Acompanhamento" },
];

export function Navigation() {
  const pathname = usePathname();
  const renderLink = (link: { href: string; label: string }) => {
    const current =
      pathname === link.href || pathname.startsWith(`${link.href}/`);
    return (
      <Link
        aria-current={current ? "page" : undefined}
        className={current ? "current" : ""}
        href={link.href}
        key={link.href}
      >
        {link.label}
      </Link>
    );
  };
  return (
    <nav className="app-nav" aria-label="Navegação principal">
      <div className="view-switcher" aria-label="Visualização do planejamento">
        {viewLinks.map(renderLink)}
      </div>
      <div className="resource-navigation">{resourceLinks.map(renderLink)}</div>
    </nav>
  );
}
