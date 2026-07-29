import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Timetable",
  description: "AI-assisted school timetable generator",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
