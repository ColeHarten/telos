import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Report-only by default: the browser logs violations to the console and
// blocks nothing. CSP_ENFORCE=true (set at build time) enforces it; turn it on
// once a full run-through logs no violations (see docs/security.md).
const enforceCsp = process.env.CSP_ENFORCE === "true";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://cdn.plaid.com https://apis.google.com https://www.gstatic.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com https://plaid-merchant-logos.plaid.com https://plaid-category-icons.plaid.com https://plaid-counterparty-logos.plaid.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.plaid.com",
  "frame-src https://cdn.plaid.com https://*.firebaseapp.com https://accounts.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: enforceCsp ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Telos doesn't use next/image, so the image optimizer endpoint stays off.
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
