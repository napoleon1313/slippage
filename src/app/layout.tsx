import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Perp Execution Cost Dashboard",
  description: "Perpetual exchange slippage & execution cost comparison",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Nav />
        <div style={{ paddingTop: "0px" }}>{children}</div>
      </body>
    </html>
  );
}
