import { GateShell } from "@/components/GateShell";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { homePath } from "@/lib/access";
import Link from "next/link";

export default async function HomePage() {
  const session = await readSession();
  if (session) redirect(homePath(session));
  return (
    <GateShell>
      <h2>Sign in</h2>
      <p>
        Client, Tracker, and Admin accounts are invited per company. Boards are
        not public.
      </p>
      <Link className="primary" href="/login">
        SIGN IN
      </Link>
    </GateShell>
  );
}
