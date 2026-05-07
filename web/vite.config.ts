import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg", "favicon.ico", "favicon-16.png", "favicon-32.png",
        "apple-touch-icon.png", "apple-touch-icon-152.png", "apple-touch-icon-167.png",
        "icon-192.png", "icon-512.png", "icon-192-maskable.png", "icon-512-maskable.png"
      ],
      manifest: {
        name: "Do it",
        short_name: "Do it",
        description: "Tägliche Reinigungsaufgaben verwalten",
        theme_color: "#0F0F0F",
        background_color: "#0F0F0F",
        display: "standalone",
        orientation: "any",
        scope: "/",
        start_url: "/",
        lang: "de",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        // Force the new service worker to take over IMMEDIATELY so the old
        // cached icons / manifest don't keep showing up after this update.
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webp}"],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 }
            }
          }
        ]
      },
      devOptions: { enabled: false }
    })
  ],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    hmr: { clientPort: 443 }
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    allowedHosts: true
  }
});
