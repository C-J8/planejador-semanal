import type { Metadata } from "next";
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
        <header>
          <div className="container">
            <strong>Planejador semanal</strong>
            <Navigation />
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
