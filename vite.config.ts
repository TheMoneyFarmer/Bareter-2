import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      // Native-only Capacitor plugins: bundled by Capacitor native runtime, not the web bundle
      external: ["@capacitor/haptics"],
      output: {
        manualChunks(id) {
          // React core — changes almost never, max cache hits
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/scheduler/")) {
            return "vendor-react";
          }
          // Radix UI + shadcn primitives — large but stable
          if (id.includes("node_modules/@radix-ui/")) {
            return "vendor-radix";
          }
          // TanStack Query
          if (id.includes("node_modules/@tanstack/")) {
            return "vendor-query";
          }
          // Charts — heavy, only needed on dashboard/analytics pages
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-") || id.includes("node_modules/victory-")) {
            return "vendor-charts";
          }
          // Maps — only needed on map/listing pages
          if (id.includes("node_modules/leaflet") || id.includes("node_modules/react-leaflet")) {
            return "vendor-maps";
          }
          // Animation
          if (id.includes("node_modules/framer-motion")) {
            return "vendor-motion";
          }
          // Form + validation
          if (id.includes("node_modules/react-hook-form") || id.includes("node_modules/zod") || id.includes("node_modules/@hookform/")) {
            return "vendor-forms";
          }
          // Date utilities
          if (id.includes("node_modules/date-fns")) {
            return "vendor-dates";
          }
          // All remaining node_modules go into a shared vendor chunk
          if (id.includes("node_modules/")) {
            return "vendor-misc";
          }
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
