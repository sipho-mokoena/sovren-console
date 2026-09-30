import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// From config/ports.env, via the Makefile. Never written here.
const consolePort = Number(process.env.SOVREN_CONSOLE_PORT ?? 4141);

export default defineConfig({
  server: { port: consolePort, strictPort: true },
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    // SPA, deliberately. There is no control plane in this prototype, so every
    // byte of data comes from a mock backend running in the browser behind a
    // service worker -- and a server-rendered first paint would be a paint of
    // data the server cannot have, fetched before that worker is listening. The
    // console waits for the worker instead (see `app-providers.tsx`), which is a
    // blank moment rather than a screen full of errors that are an artefact of
    // startup. The moment a real control plane exists, this goes back to SSR.
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
});
