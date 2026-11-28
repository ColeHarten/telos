import type { MetadataRoute } from "next";

/** Lets Telos be added to the Home Screen and open full screen, like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Telos",
    short_name: "Telos",
    description: "Money with purpose",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
