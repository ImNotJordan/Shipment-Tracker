import { redirect } from "next/navigation";
import { readSessionContext } from "@/lib/session";
import { listUsers, visibleCompanies } from "@/lib/store";
import { AdminConsole } from "@/components/AdminConsole";

export default async function AdminPage() {
  const context = await readSessionContext();
  if (!context || context.user.role !== "admin") redirect("/login?next=/admin");
  if (context.user.mustChangePassword) redirect("/login");
  const [companies, users] = await Promise.all([
    visibleCompanies(context.user, context.idToken),
    listUsers(context.idToken),
  ]);
  return (
    <AdminConsole
      user={context.user}
      initialCompanies={companies}
      initialUsers={users}
    />
  );
}
