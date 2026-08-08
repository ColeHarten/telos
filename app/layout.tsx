import type { Metadata } from "next";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Telos: Money with purpose",
  description: "Personal budgeting app",
  icons: {
    icon: "/favicon.ico?v=1.0",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico?v=1.0" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}