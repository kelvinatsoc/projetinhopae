import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// base "./" permite publicar em qualquer subpasta (ex.: GitHub Pages /projetinhopae/)
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png", "icons/favicon.svg"],
      manifest: {
        name: "Lendas da Base — Manager de Futebol",
        short_name: "Lendas da Base",
        description: "Manager de futebol casual com as ligas brasileiras e lendas renascendo nas categorias de base.",
        lang: "pt-BR",
        theme_color: "#0c1712",
        background_color: "#0c1712",
        display: "standalone",
        orientation: "portrait",
        start_url: ".",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,json,webmanifest}"],
        // a mídia (fotos, escudos, estádios, sons) é grande demais para baixar toda na instalação:
        // cada arquivo é guardado no cache na primeira vez que aparece na tela
        globIgnores: ["media/**"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes("/media/"),
            handler: "CacheFirst",
            options: {
              cacheName: "lendas-midia",
              expiration: { maxEntries: 5000, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
