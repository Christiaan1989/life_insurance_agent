import type { Metadata } from "next";
import "./globals.css";
import { DM_Sans, Fraunces, JetBrains_Mono } from "next/font/google";
import React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  preload: true,
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fraunces",
  preload: true,
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  preload: true,
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sentinel Life — Claims Portal",
  description: "File and manage life insurance claims with Sentinel AI Assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body
        className={dmSans.className}
        style={{
          background: "var(--sl-bg)",
          color: "var(--sl-ink)",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
