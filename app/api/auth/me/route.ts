import { NextResponse } from "next/server";
import { currentUser } from "@/lib/app-auth";

export const runtime = "nodejs";

const ADMIN_EMAIL = "yassinalaa3310@gmail.com";

export async function GET() {
  const user = await currentUser({ allowFrozen: true });
  if (!user) {
    return NextResponse.json(
      { authenticated: false, connected: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json({
    authenticated: true,
    connected: true,
    accountStatus: user.accountStatus || "active",
    isAdmin: user.email.toLowerCase() === ADMIN_EMAIL,
    profile: { name: user.name, email: user.email, picture: user.picture }
  }, { headers: { "Cache-Control": "private,no-store" } });
}
