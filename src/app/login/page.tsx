import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { LoginForm } from "@/components/LoginForm";
import { homePath } from "@/lib/access";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await readSession();
  const { next } = await searchParams;
  const nextPath = next && next.startsWith("/") ? next : "";
  if (session?.mustChangePassword) {
    return (
      <ChangePasswordForm
        email={session.email}
        nextPath={nextPath || homePath(session)}
      />
    );
  }
  if (session) redirect(nextPath || homePath(session));
  return <LoginForm nextPath={nextPath} />;
}
