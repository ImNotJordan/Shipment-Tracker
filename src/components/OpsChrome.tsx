"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { closeViewAsTab, openViewAsTab, useConfirm } from "./ConfirmDialog";
import { ActionProgress } from "./ActionProgress";
import { BrandMark } from "./BrandMark";

export function OpsChrome({
  user,
  station,
  clientSlug,
  children,
}: {
  user: SessionUser;
  station: "ADMIN" | "TRACKER";
  clientSlug?: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const confirm = useConfirm();
  const [clock, setClock] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const onAdmin = pathname.startsWith("/admin");
  const onTracker = pathname.startsWith("/tracker");
  const viewingAsTracker = station === "TRACKER" && user.role === "admin";
  const clientHref = clientSlug || user.companySlug
    ? `/track/${clientSlug || user.companySlug}`
    : null;

  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "UTC",
        }).format(new Date()) + " UTC",
      );
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  async function logout() {
    if (viewingAsTracker) return;
    const ok = await confirm({
      title: "SIGN OUT",
      body: "This ends the session in every open Live Board tab.",
      confirmLabel: "SIGN OUT",
      danger: true,
    });
    if (!ok) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      setSigningOut(false);
    }
  }

  async function viewAs(href: string, title: string, body: string) {
    const ok = await confirm({ title, body, confirmLabel: "OPEN TAB" });
    if (!ok) return;
    openViewAsTab(href);
  }

  async function closePreview() {
    const ok = await confirm({
      title: "CLOSE PREVIEW",
      body: "Close this tracker preview and return to Admin?",
      confirmLabel: "CLOSE",
    });
    if (!ok) return;
    closeViewAsTab(() => router.push("/admin"));
  }

  return (
    <main className={`ops ops-${station.toLowerCase()}${viewingAsTracker ? " is-viewing" : ""}`}>
      <header className="ident" data-region="ident-bar">
        <div className="ident-left">
          <BrandMark />
          <h1 className="wordmark">LIVE BOARD</h1>
          <span className="ident-pipe" aria-hidden>
            |
          </span>
          <p className="live-board-label">
            {viewingAsTracker ? "VIEWING AS TRACKER" : station}
          </p>
        </div>
        <div className="ident-right">
          <p className="last-fetch">
            {clock || "—"}
            <span className="pip" aria-hidden />
          </p>
          <nav className="ops-nav" aria-label="Operator">
            <span className="ops-who">
              {user.email}
              <em>{user.role}</em>
            </span>
            {user.role === "admin" ? (
              onAdmin ? (
                <Link href="/admin" aria-current="page">
                  Admin
                </Link>
              ) : viewingAsTracker ? (
                <button type="button" onClick={() => void closePreview()}>
                  Close preview
                </button>
              ) : (
                <Link href="/admin">Admin</Link>
              )
            ) : null}
            {user.role === "admin" ? (
              onTracker ? (
                <Link href="/tracker" aria-current="page">
                  Tracker
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    void viewAs(
                      "/tracker",
                      "VIEW AS TRACKER",
                      "Opens the tracker console in a new tab. Close preview there to return here.",
                    )
                  }
                >
                  View as Tracker
                </button>
              )
            ) : user.role === "tracker" ? (
              <Link href="/tracker" aria-current={onTracker ? "page" : undefined}>
                Tracker
              </Link>
            ) : null}
            {clientHref ? (
              <button
                type="button"
                onClick={() =>
                  void viewAs(
                    clientHref,
                    "VIEW AS CLIENT",
                    "Opens this company's live board in a new tab, as a client would see it. Close preview there to return here.",
                  )
                }
              >
                View as Client
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void logout()}
              disabled={viewingAsTracker || signingOut}
              aria-busy={signingOut}
            >
              <LogOut size={12} aria-hidden />
              {signingOut ? "SIGNING OUT" : "Sign out"}
            </button>
          </nav>
        </div>
        <ActionProgress overlay active={signingOut} label="SIGNING OUT" />
        {signingOut ? (
          <span className="sr-only" role="status">
            Signing out
          </span>
        ) : null}
      </header>
      {children}
    </main>
  );
}
