"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyControl } from "./ActionProgress";
import { GatePasswordField, GateShell } from "./GateShell";
import { boardDest } from "@/lib/passwords";
import { prefersReducedMotion } from "@/lib/ops-motion";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{ text: string; setup: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setPending(false);
      // 403 means the credentials were right but the account has no company yet.
      // That is a setup gap, not a rejection, so it must not read as one.
      setError({ text: json.error ?? "Sign in failed.", setup: res.status === 403 });
      return;
    }
    if (json.mustChangePassword) {
      router.refresh();
      return;
    }
    const dest = boardDest(nextPath, json.next ?? "/login");
    const go = () => {
      router.push(dest);
      router.refresh();
    };
    // Let the gate play itself out before the board takes over — but never
    // make someone wait on an animation they have asked not to see.
    setLeaving(true);
    if (prefersReducedMotion()) {
      go();
      return;
    }
    window.setTimeout(go, 620);
  }

  return (
    <GateShell pending={pending} leaving={leaving}>
      <form className="gate-form" onSubmit={onSubmit} aria-busy={pending}>
        <header className="gate-head">
          <h2>Welcome back</h2>
          <p>Sign in to open your company board.</p>
        </header>
        {error ? (
          <p className={error.setup ? "flash flash-setup" : "flash flash-bad"}>
            {error.text}
          </p>
        ) : null}
        <div className="gate-field">
          <input
            id="email-field"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder=" "
            required
            disabled={pending}
          />
          <label htmlFor="email-field">EMAIL</label>
        </div>
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
      <aside className="gate-aside">
        <div>
          <h3>WHAT THIS IS</h3>
          <p>
            A live board of your company&rsquo;s FedEx shipments — status, route, and
            scan history, read straight from FedEx.
          </p>
        </div>
        <div>
          <h3>DATA REFRESH</h3>
          <p>Every two minutes, automatically. No reload needed.</p>
        </div>
        <div>
          <h3>NO ACCESS?</h3>
          <p>
            Accounts are issued by invitation. If your credentials have not arrived
            or no longer work, ask your administrator to re-issue them.
          </p>
        </div>
      </aside>
    </GateShell>
  );
}
