import Link from "next/link";
import type { ReactNode } from "react";

interface LegalPageProps {
  title: string;
  children: ReactNode;
}

export default function LegalPage({
  title,
  children,
}: LegalPageProps) {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "40px 20px",
        lineHeight: 1.6,
      }}
    >
      <p>
        <Link href="/login">Inlinked</Link>
      </p>

      <h1>{title}</h1>

      {children}

      <p style={{ marginTop: 32 }}>
        <Link href="/terms">Terms</Link>
        {" · "}
        <Link href="/privacy">Privacy</Link>
        {" · "}
        <Link href="/refund">Refunds</Link>
      </p>
    </main>
  );
}
