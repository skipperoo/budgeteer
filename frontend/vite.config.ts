import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";

const certDir = path.resolve(__dirname, "../certs");
const httpsKey = path.join(certDir, "dev-key.pem");
const httpsCert = path.join(certDir, "dev-cert.pem");
const hasCerts = fs.existsSync(httpsKey) && fs.existsSync(httpsCert);

/** @type {import('vite').HttpsServerOptions | boolean} */
const httpsConfig = hasCerts
  ? {
      key: fs.readFileSync(httpsKey),
      cert: fs.readFileSync(httpsCert),
    }
  : false;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    https: httpsConfig,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
