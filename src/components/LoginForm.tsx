"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyControl } from "./ActionProgress";
import { GatePasswordField, GateShell } from "./GateShell";
import { boardDest } from "@/lib/passwords";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setPending(false);
      setError(json.error ?? "Sign in failed.");
      return;
    }
    if (json.mustChangePassword) {
      router.refresh();
      return;
    }
    const dest = boardDest(nextPath, json.next ?? "/login");
    router.push(dest);
    router.refresh();
  }

  return (
    <GateShell pending={pending}>
      <form className="gate-form" onSubmit={onSubmit} aria-busy={pending}>
        <h2>Sign in</h2>
        {error ? <p className="flash flash-bad">{error}</p> : null}
        <label>
          EMAIL
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={pending}
          />
        </label>
        <GatePasswordField
          label="PASSWORD"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          required
          disabled={pending}
        />
        <BusyControl active={pending} label="SIGNING IN">
          <button className="primary" type="submit" disabled={pending}>
            {pending ? "SIGNING IN" : "SIGN IN"}
          </button>
        </BusyControl>
      </form>
    </GateShell>
  );
}
