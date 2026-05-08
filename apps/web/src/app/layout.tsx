import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Sans } from "next/font/google";
import "./global.css";

// Inter stands in for BinanceNova (humanist sans, weight 400–700).
const inter = Inter({
  variable: "--font-display",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// IBM Plex Sans stands in for BinancePlex (tabular numerals, finance-grade
// proportions). Used for every monetary figure, percentage, stat counter.
const plex = IBM_Plex_Sans({
  variable: "--font-tabular",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Budget",
  description: "Family budgeting and wealth tracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Budget",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0e11",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning>
      <body
        className={`${inter.variable} ${plex.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
