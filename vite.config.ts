import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    proxy: {
      "/supabase-api": {
        target: "https://ohnjcnwlhggeobftfbnr.supabase.co",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/supabase-api/, ""),
        secure: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — cached independently; changes least often
          vendor: ["react", "react-dom", "react-router-dom"],
          // Supabase client — large, rarely updated
          supabase: ["@supabase/supabase-js"],
          // Radix UI + lucide icons — large, rarely updated
          ui: [
            "lucide-react",
            "@radix-ui/react-select",
            "@radix-ui/react-dialog",
            "@radix-ui/react-tabs",
            "@radix-ui/react-dropdown-menu",
          ],
        },
      },
    },
  },
}));
