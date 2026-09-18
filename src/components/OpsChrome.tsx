"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { closeViewAsTab, openViewAsTab, useConfirm } from "./ConfirmDialog";
import { ThemeToggle } from "./ThemeToggle";
import { ActionProgress } from "./ActionProgress";
import { BrandMark } from "./BrandMark";
import { brandVars } from "@/lib/brand";

export function OpsChrome({
  user,
  station,
  clientSlug,
  nav,
  bar,
  brand,
  embedded,
  children,
}: {
  user: SessionUser;
  station: "ADMIN" | "TRACKER";
  clientSlug?: string | null;
  /** Station switcher, centred in the ident. */
  nav?: ReactNode;
  /** Station tools — search, filters — on the left of the operator bar. */
  bar?: ReactNode;
  /** Company whose colours theme this station. */
  brand?: { accent?: string | null; background?: string | null } | null;
  /** Rendered inside Admin's preview pane, which supplies the chrome. */
  embedded?: boolean;
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
    <main
      className={`ops ops-${station.toLowerCase()}${viewingAsTracker ? " is-viewing" : ""}${embedded ? " is-embedded" : ""}`}
      style={brandVars(brand)}
    >
      {embedded ? null : (
        <>
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
            {nav ? (
              <nav className="ident-nav" aria-label="Station">
                {nav}
              </nav>
            ) : null}
            <div className="ident-right">
              <ThemeToggle />
              <p className="last-fetch">
                {clock || "—"}
                <span className="pip" aria-hidden />
              </p>
            </div>
          </header>
          <div className="ops-bar">
            <div className="ops-bar-left">{bar}</div>
            <nav className="ops-nav" aria-label="Operator">
              <span className="ops-who">
                {user.email}
                <em>{user.role}</em>
              </span>
              {/* Nowhere to go but here: the station is already named in the
                  ident and again on the badge to the left, so a link back to
                  the page you are on is the third copy and reads as a repeat. */}
              {user.role === "admin" && !onAdmin ? (
                viewingAsTracker ? (
                  <button type="button" onClick={() => void closePreview()}>
                    Close preview
                  </button>
                ) : (
                  <Link href="/admin">Admin</Link>
                )
              ) : null}
              {user.role === "admin" && !nav && !onTracker ? (
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
              ) : user.role === "tracker" && !onTracker ? (
                <Link href="/tracker">Tracker</Link>
              ) : null}
              {clientHref && !nav ? (
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
        </>
      )}
      {children}
      {/* Leaving gets the same loader as arriving. */}
      <ActionProgress overlay active={signingOut} label="SIGNING OUT" />
    </main>
  );
}
