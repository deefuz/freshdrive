import type { Metadata } from "next";
import { Bricolage_Grotesque, Roboto } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./_components/logo";
import { btn } from "./_components/ui";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["700", "800"] });
const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: "FreshDrive",
  description: "Les dîners de la semaine choisis avec les promos de ton Drive (Auchan ou Leclerc), et le panier rempli pour toi.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr" className={`${bricolage.variable} ${roboto.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="vichy print:hidden">
          <nav className="mx-auto max-w-5xl px-4 py-4">
            <div className="flex items-center justify-between gap-4 rounded-lg bg-paper px-4 py-2.5 shadow-card">
              <div className="flex items-center gap-8">
                <Link href="/" aria-label="FreshDrive, accueil" className="rounded">
                  <Logo />
                </Link>
                <div className="hidden items-center gap-6 text-[0.9375rem] font-medium sm:flex">
                  <Link href="/" className="hover:underline">
                    Mes semaines
                  </Link>
                  <Link href="/depenses" className="hover:underline">
                    Mes dépenses
                  </Link>
                  <Link href="/profil" className="hover:underline">
                    Mon profil
                  </Link>
                </div>
              </div>
              <Link href="/semaines/nouvelle" className={btn.secondary}>
                Nouvelle semaine
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-8 pb-16 print:max-w-none print:p-0">{children}</main>
        <footer className="print:hidden">
          <p className="px-4 pb-4 text-center text-xs text-pebble">
            FreshDrive, par{" "}
            <a href="https://seb.couix.net" target="_blank" rel="noopener" className="font-medium text-graphite underline-offset-2 hover:underline">
              Sébastien Couix
            </a>
          </p>
          <div className="vichy h-4 [--vichy-size:16px]" aria-hidden="true" />
        </footer>
      </body>
    </html>
  );
}
