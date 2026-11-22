import { currentUser } from "@/lib/app-auth";

export const ADMIN_EMAIL = "yassinalaa3310@gmail.com";

export async function currentAdmin() {
  const user = await currentUser();
  if (!user || user.email.toLowerCase() !== ADMIN_EMAIL) return null;
  return user;
}
