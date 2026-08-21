import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://calendair.app"),
  applicationName: "CALENDAIR",
  title: {
    default: "CALENDAIR — Your time, perfected.",
    template: "%s · CALENDAIR",
  },
  description:
    "The in-calendar travel butler. CALENDAIR watches for the free time you did not know you had, and turns it into a safely bookable escape.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "CALENDAIR",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "CALENDAIR — Your time, perfected.",
    description:
      "You don't search for the trip. The right trip finds you. A calendar opening becomes a real, verified escape — with a person at every step that costs money.",
    siteName: "CALENDAIR",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#faf7f5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
