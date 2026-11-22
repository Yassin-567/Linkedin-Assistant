import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import AppShell from "../components/AppShell";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-ibm-plex-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: "Inlinked",
  description: "A business development workspace for finding customers, managing LinkedIn connections and tracking opportunities."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={ibmPlexSans.variable}><AppShell>{children}</AppShell></body>
    </html>
  );
}
