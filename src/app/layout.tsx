import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KPMG Execution Cost Dashboard",
  description: "Perpetual exchange slippage & execution cost comparison",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
