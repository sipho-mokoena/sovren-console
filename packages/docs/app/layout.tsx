import type { ReactNode } from "react";
import type { Viewport } from "next";
import { RootProvider } from "fumadocs-ui/provider/base";
import { TreeContextProvider } from "fumadocs-ui/contexts/tree";
import { NextProvider } from "fumadocs-core/framework/next";
import { source } from "@/lib/source";
import "./global.css";

export const metadata = {
  title: {
    template: "%s | sovren",
    default: "sovren",
  },
  description:
    "The control plane for an estate of retired university desktops: one vocabulary for Proxmox, NetBird and Dokploy.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#fff" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <NextProvider>
          <TreeContextProvider tree={source.getPageTree()}>
            <RootProvider
              search={{
                links: [
                  ["Runbook", "/docs/guide/runbook"],
                  ["Port map", "/docs/guide/ports"],
                  ["Requirements R1–R69", "/docs/tech-stack"],
                ],
              }}
            >
              {children}
            </RootProvider>
          </TreeContextProvider>
        </NextProvider>
      </body>
    </html>
  );
}
