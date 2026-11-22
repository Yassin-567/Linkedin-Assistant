import { notFound } from "next/navigation";
import AdminDashboard from "@/components/AdminDashboard";
import { currentAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await currentAdmin();
  if (!admin) notFound();
  return <AdminDashboard adminEmail={admin.email} />;
}
