import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, openSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  const session = value ? openSession(value) : null;
  if (!session) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: true,
    profile: { name: session.name, email: session.email, picture: session.picture },
    expiresAt: session.expiresAt
  });
}
