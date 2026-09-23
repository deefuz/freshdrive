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
  title: "MyFresh",
  description: "Les dîners de la semaine choisis avec les promos Auchan Drive, et le panier rempli pour toi.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr" className={`${bricolage.variable} ${roboto.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="print:hidden">
          <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-8">
              <Link href="/" aria-label="MyFresh, accueil" className="rounded">
                <Logo />
              </Link>
              <div className="hidden items-center gap-6 text-[0.9375rem] font-medium sm:flex">
                <Link href="/" className="hover:underline">
                  Mes semaines
                </Link>
                <Link href="/depenses" className="hover:underline">
                  Mes dépenses
                </Link>
              </div>
            </div>
            <Link href="/semaines/nouvelle" className={btn.secondary}>
              Nouvelle semaine
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-16 print:max-w-none print:p-0">{children}</main>
      </body>
    </html>
  );
}
