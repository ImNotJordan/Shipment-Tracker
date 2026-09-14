"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyControl } from "./ActionProgress";
import { GatePasswordField, GateShell } from "./GateShell";
import { boardDest, passwordProblem } from "@/lib/passwords";

export function ChangePasswordForm({
  email,
  nextPath,
}: {
  email: string;
  nextPath: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblem({ next: password, confirm, email });
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError("");
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password, confirm }),
    });
    const json = await res.json();
    if (!res.ok) {
      setPending(false);
      setError(json.error ?? "Could not set password.");
      return;
    }
    const dest = boardDest(nextPath, json.next ?? "/login");
    router.push(dest);
    router.refresh();
  }

  async function signOut() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.refresh();
    } catch {
      setPending(false);
    }
  }

  return (
    <GateShell
      pending={pending}
      progressLabel={pending ? "SAVING PASSWORD" : "SIGNING IN"}
      copy="Temporary password accepted. Set a password only you know, then your board opens."
    >
      <form className="gate-form" onSubmit={onSubmit} aria-busy={pending}>
        <h2>Set password</h2>
        <p>The invite password is temporary. Choose a new one to continue.</p>
        {error ? <p className="flash flash-bad">{error}</p> : null}
        <label>
          EMAIL
          <input type="email" autoComplete="username" value={email} readOnly />
        </label>
        <GatePasswordField
          label="NEW PASSWORD"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          required
          disabled={pending}
        />
        <GatePasswordField
          label="CONFIRM PASSWORD"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          required
          disabled={pending}
        />
        <BusyControl active={pending} label="SAVING PASSWORD">
          <button className="primary" type="submit" disabled={pending}>
            {pending ? "SAVING PASSWORD" : "SAVE PASSWORD"}
          </button>
        </BusyControl>
        <button className="gate-abort" type="button" onClick={() => void signOut()} disabled={pending}>
          SIGN OUT
        </button>
      </form>
    </GateShell>
  );
}
