import "~/styles/globals.css";

import { type Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";

import { AccentProvider } from "~/components/accent-provider";
import { CompactModeProvider } from "~/components/compact-mode-provider";
import { DataProvider } from "~/components/data-provider";
import { FocusProvider } from "~/components/focus-provider";
import { ThemeProvider } from "~/components/theme-provider";
import { Toaster } from "~/components/ui/sonner";

import { SpeedInsights } from "@vercel/speed-insights/next";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stride",
  description: "Stride helps students turn plans into progress.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    shortcut: ["/favicon.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${ibmPlexMono.variable}`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          themes={["light", "dark"]}
          disableTransitionOnChange
        >
          <DataProvider>
            <CompactModeProvider>
              <AccentProvider>
                <FocusProvider>
                  {children}
                  <Toaster />
                </FocusProvider>
              </AccentProvider>
            </CompactModeProvider>
          </DataProvider>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
