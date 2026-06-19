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
  // maximumScale + userScalable belt-and-suspenders against iOS Safari
  // double-tap-zoom on the spendings grid. CSS `touch-action: manipulation`
  // is the primary defence but Safari has shipped versions that still trigger
  // a viewport zoom on rapid double-taps over text spans. Hard-capping the
  // scale keeps double-tap-zoom suppressed across iOS versions. Pinch-zoom
  // for accessibility is still honored by iOS regardless of these values.
  maximumScale: 1,
  userScalable: false,
  // UAT-08: required for env(safe-area-inset-*) to resolve on iOS — the
  // (app) shell pads its scroll surface with the bottom inset so content
  // clears Safari's floating bottom bar / the home indicator. The header
  // compensates the top inset (see (app)/layout.tsx).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning>
      <head>
        {/* PRE-PAINT offline marker. On an offline HARD reload (OfflineNavGuard
            forces document navigations offline), the offline staleness bar — a
            client leaf that SSRs null — used to pop in after hydration and shove
            content down. This blocking <head> script runs BEFORE first paint and
            sets `html.is-offline` from navigator.onLine, so global.css can
            reserve the bar's slot height in the very first frame (no jump). It
            also keeps the class in sync with online/offline events. Inline +
            static string (no user data) — `suppressHydrationWarning` on <html>
            covers the class it toggles. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var d=document.documentElement;function s(){d.classList.toggle('is-offline',navigator.onLine===false);}s();addEventListener('online',s);addEventListener('offline',s);}catch(e){}})();",
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${plex.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
