import type { Metadata } from "next";
import Link from "next/link";
import { Navigation } from "@/components/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planejador semanal",
  description: "Planejador visual de rotina",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="app-header">
          <div className="app-header-inner">
            <Link
              className="app-brand"
              href="/semana"
              aria-label="Planner, ir para a semana"
            >
              <span className="app-brand-mark" aria-hidden="true">
                P
              </span>
              <span>
                <strong>Planner</strong>
              </span>
            </Link>
            <Navigation />
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
