import type { Metadata } from "next";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: "Rozvrhář",
  description: "Tvorba školních rozvrhů s podporou automatického plánování",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs">
      <body>
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
