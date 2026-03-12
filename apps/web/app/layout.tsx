import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Körjournal - Administrationspanel",
  description: "Digital körjournal för företag. Hantera resor, fordon och exportera rapporter.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv" className={inter.variable}>
      <body className={`${inter.className} min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
