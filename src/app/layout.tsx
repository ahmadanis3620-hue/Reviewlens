import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ReputeIQ — Know what your customers are really saying",
    template: "%s · ReputeIQ",
  },
  description:
    "ReputeIQ continuously analyzes your reviews, identifies reputation problems, tracks competitors, and tells you what to fix next.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
