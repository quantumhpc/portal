import type { Metadata } from "next";
// Fonts ship in the `geist` package so builds work on air-gapped clusters
// (next/font/google downloads from Google at build time).
import { GeistSans as geistSans } from "geist/font/sans";
import { GeistMono as geistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "@/components/layout/providers";

export const metadata: Metadata = {
  title: "QuantumHPC Portal",
  description: "Web interface for HPC job schedulers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
