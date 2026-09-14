import { redirect } from "next/navigation";
import { readSessionContext } from "@/lib/session";
import { listAudits, listShipments, visibleCompanies } from "@/lib/store";
import { TrackerConsole } from "@/components/TrackerConsole";
import { homePath } from "@/lib/access";

export default async function TrackerPage() {
  const context = await readSessionContext();
  if (!context) redirect("/login?next=/tracker");
  if (context.user.mustChangePassword) redirect("/login");
  if (context.user.role === "client") redirect(homePath(context.user));
  const companies = await visibleCompanies(context.user, context.idToken);
  const selected =
    companies.find((company) => company.id === context.user.companyId) ??
    companies.find((company) => company.slug === "ronin") ??
    companies[0];
  const companyId = selected?.id ?? "";
  const [shipments, audits] = companyId
    ? await Promise.all([
        listShipments(companyId, context.idToken),
        listAudits(companyId, context.idToken),
      ])
    : [[], []];
  return (
    <TrackerConsole
      user={context.user}
      initialCompanies={companies}
      initialShipments={shipments}
      initialAudits={audits}
      initialCompanyId={companyId}
      lockCompany={context.user.role === "tracker"}
    />
  );
}
