"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Slippage Dashboard" },
  { href: "/tokenomics", label: "Tokenomics" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: "48px",
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: "8px",
      }}
    >
      <span
        className="text-xs font-bold tracking-widest mr-4"
        style={{ color: "var(--text-secondary)", letterSpacing: "0.12em" }}
      >
        CRYPTO COE
      </span>
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            style={{
              fontSize: "13px",
              fontWeight: active ? 600 : 400,
              color: active ? "#60a5fa" : "var(--text-secondary)",
              textDecoration: "none",
              padding: "4px 12px",
              borderRadius: "6px",
              borderBottom: active ? "2px solid #60a5fa" : "2px solid transparent",
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
