import "~/styles/globals.css";

import { type Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";

import { AccentProvider } from "~/components/accent-provider";
import { DataProvider } from "~/components/data-provider";
import { FocusProvider } from "~/components/focus-provider";
import { ThemeProvider } from "~/components/theme-provider";
import { Toaster } from "~/components/ui/sonner";

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
  icons: [{ rel: "icon", url: "/favicon.ico" }],
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
          themes={["light", "dark", "midnight"]}
          disableTransitionOnChange
        >
          <AccentProvider>
            <DataProvider>
              <FocusProvider>
                {children}
                <Toaster />
              </FocusProvider>
            </DataProvider>
          </AccentProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
