import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { AppStateProvider } from "@/components/AppState";
import { BottomNav } from "@/components/BottomNav";
import { Logo } from "@/components/Logo";
import { ServiceWorker } from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "Virée — boucles vélo depuis chez toi",
  description: "Dis combien de temps tu as, Virée trace la boucle. Gratuit, sans abonnement.",
  applicationName: "Virée",
  appleWebApp: { capable: true, title: "Virée", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0B0F14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <AppStateProvider>
          <header className="fixed inset-x-0 top-0 z-30 border-b border-line/60 bg-night/90 pt-[env(safe-area-inset-top)] backdrop-blur">
            <div className="mx-auto flex max-w-xl items-center justify-between px-3 py-1.5">
              <Link href="/" aria-label="Virée, accueil" className="rounded-2xl px-1 py-1">
                <Logo />
              </Link>
              <Link href="/compte" className="flex min-h-12 items-center rounded-2xl bg-raised px-4 font-semibold">
                Compte
              </Link>
            </div>
          </header>
          <main>{children}</main>
          <BottomNav />
        </AppStateProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
