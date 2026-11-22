import { cookies } from "next/headers";
import { APP_COOKIE_NAME, openAppSession } from "@/lib/app-session";
import { db } from "@/lib/db";

type CurrentUserOptions = { allowFrozen?: boolean };

export async function currentUser(options: CurrentUserOptions = {}) {
  const jar = await cookies();
  const value = jar.get(APP_COOKIE_NAME)?.value;
  const session = value ? openAppSession(value) : null;
  if (!session) return null;

  try {
    const sql = db();
    const rows: any = await sql`SELECT email, name, picture, account_status, session_version
      FROM app_users WHERE id = ${session.userId} LIMIT 1`;
    if (!rows.length) return null;

    const row = rows[0];
    const accountStatus = String(row.account_status || "active");
    const sessionVersion = Number(row.session_version || 0);
    if (Number(session.sessionVersion ?? 0) !== sessionVersion) return null;
    if (accountStatus === "banned") return null;
    if (accountStatus === "frozen" && !options.allowFrozen) return null;

    return {
      ...session,
      email: String(row.email || session.email).toLowerCase(),
      name: String(row.name || session.name),
      picture: row.picture || session.picture,
      sessionVersion,
      accountStatus
    };
  } catch (error) {
    console.error("Current account status check failed", error);
    return null;
  }
}
