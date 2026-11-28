import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import Providers from "./providers";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Telos: Money with purpose",
  description: "Personal budgeting app",
  icons: {
    icon: "/favicon.ico?v=1.0",
  },
  // Home Screen app on iOS: full screen, its own name, and a light status bar.
  appleWebApp: {
    capable: true,
    title: "Telos",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}