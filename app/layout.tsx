import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AFTER//ZERO",
  description: "Cyberpunk campaign, procedural Sector Forge and mixed human/AI arenas.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
