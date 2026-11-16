import { cookies } from "next/headers";
import { APP_COOKIE_NAME, openAppSession } from "@/lib/app-session";

export async function currentUser() {
  const jar = await cookies();
  const value = jar.get(APP_COOKIE_NAME)?.value;
  return value ? openAppSession(value) : null;
}
