"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { animate } from "animejs";
import { Filter } from "lucide-react";
import { RouteMap } from "./RouteMap";
import { useRouter } from "next/navigation";
import { homePath } from "@/lib/access";
import type { PublicBoard, PublicShipment, SessionUser } from "@/lib/types";
import { ConfirmProvider, closeViewAsTab, useConfirm } from "./ConfirmDialog";
import { ActionProgress } from "./ActionProgress";

function formatTracking(value: string) {
  return value.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function formatWhen(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function statusTone(status?: string | null) {
  const value = (status ?? "").toUpperCase();
  if (value.includes("DELIVER")) return "ok";
  if (
    value.includes("EXCEPT") ||
    value.includes("DELAY") ||
    value.includes("FAIL") ||
    value.includes("OAUTH") ||
    value.includes("MISSING")
  )
    return "bad";
  if (value) return "live";
  return "muted";
}

function facts(shipment: PublicShipment | null) {
  return shipment?.snapshot?.facts;
}

export function TrackingBoard({
  initial,
  mapsKey,
  user,
}: {
  initial: PublicBoard;
  mapsKey?: string;
  user?: SessionUser;
}) {
  return (
    <ConfirmProvider>
      <TrackingBoardInner initial={initial} mapsKey={mapsKey} user={user} />
    </ConfirmProvider>
  );
}

function TrackingBoardInner({
  initial,
  mapsKey,
  user,
}: {
  initial: PublicBoard;
  mapsKey?: string;
  user?: SessionUser;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const preview = user?.role === "admin" || user?.role === "tracker";
  const [board, setBoard] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial.shipments[0]?.id ?? null);
  const [focusEventId, setFocusEventId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"time" | "status">("time");
  const [clock, setClock] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const detailRef = useRef<HTMLElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const onMapReady = useCallback((map: google.maps.Map | null) => {
    mapRef.current = map;
  }, []);
  const selected = board.shipments.find((item) => item.id === selectedId) ?? null;

  const shipments = useMemo(() => {
    const filtered = board.shipments.filter((item) => {
      const hay = `${item.trackingNumber} ${item.snapshot?.facts.status ?? ""} ${item.snapshot?.facts.origin ?? ""} ${item.snapshot?.facts.destination ?? ""}`.toLowerCase();
      return hay.includes(query.toLowerCase());
    });
    return filtered.sort((a, b) => {
      if (sort === "status") {
        return (a.snapshot?.facts.status ?? "").localeCompare(
          b.snapshot?.facts.status ?? "",
        );
      }
      return (a.lastFetchedAt ?? a.trackingNumber).localeCompare(
        b.lastFetchedAt ?? b.trackingNumber,
      );
    });
  }, [board.shipments, query, sort]);

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

  useEffect(() => {
    const id = window.setInterval(async () => {
      const res = await fetch(`/api/board/${board.company.slug}`);
      if (!res.ok) return;
      const next = (await res.json()) as PublicBoard;
      setBoard(next);
    }, 120000);
    return () => window.clearInterval(id);
  }, [board.company.slug]);

  function selectShipment(item: PublicShipment) {
    setSelectedId(item.id);
    setFocusEventId(null);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !detailRef.current) return;
    animate(detailRef.current, {
      opacity: [0.35, 1],
      duration: 220,
      ease: "outQuad",
    });
  }

  const lastFetch = selected?.lastFetchedAt ?? board.shipments[0]?.lastFetchedAt;
  const fact = facts(selected);
  const rows = [
    ["TRACKING NUMBER", fact?.trackingNumber ?? selected?.trackingNumber ?? "—"],
    ["STATUS", fact?.status ?? selected?.lastError ?? "AWAITING FEDEX"],
    ["SERVICE", fact?.service ?? "—"],
    ["WEIGHT", fact?.weight ?? "—"],
    ["DIMENSIONS", fact?.dimensions ?? "—"],
    ["SHIP DATE", formatWhen(fact?.shipDate)],
    ["EST DELIVERY", formatWhen(fact?.estDelivery)],
    ["ORIGIN", fact?.origin ?? "—"],
    ["DESTINATION", fact?.destination ?? "—"],
    ["CONSIGNEE", fact?.consignee ?? "—"],
    ["PIECES", fact?.pieces ?? "—"],
    ["SPECIAL INSTRUCTIONS", fact?.specialInstructions ?? "—"],
  ];

  async function signOut() {
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

  async function closePreview() {
    const ok = await confirm({
      title: "CLOSE PREVIEW",
      body:
        user?.role === "admin"
          ? "Close this board preview and return to Admin?"
          : "Close this board preview and return to Tracker?",
      confirmLabel: "CLOSE",
    });
    if (!ok) return;
    closeViewAsTab(() => {
      if (user) router.push(homePath(user));
    });
  }

  return (
    <main
      className={`board${preview ? " is-viewing" : ""}`}
      style={{
        ["--amber" as string]: board.company.accent || "#e3b341",
        ["--ink" as string]: board.company.background || "#10181a",
        ["--ink-2" as string]: board.company.background || "#0a0c0f",
      }}
    >
      <header className="ident" data-region="ident-bar">
        <div className="ident-left">
          {board.company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={board.company.logoUrl} alt="" className="board-logo" />
          ) : null}
          <h1 className="wordmark" data-region="wordmark">
            {board.company.name.toUpperCase()}
          </h1>
          <span className="ident-pipe" aria-hidden>
            |
          </span>
          <p className="live-board-label" data-region="live-board-label">
            {preview ? "VIEWING AS CLIENT" : "LIVE BOARD"}
          </p>
        </div>
        <div className="ident-right">
          <p className="last-fetch" data-region="last-fetch">
            LAST FETCH {lastFetch ? formatWhen(lastFetch) : clock}
            <span className="pip" aria-hidden />
          </p>
          {preview && user ? (
            <nav className="ops-nav" aria-label="Preview">
              <span className="ops-who">
                {user.email}
                <em>{user.role}</em>
              </span>
              <button type="button" className="board-signout" onClick={() => void closePreview()}>
                Close preview
              </button>
            </nav>
          ) : user ? (
            <button
                type="button"
                className="board-signout"
                onClick={() => void signOut()}
                disabled={signingOut}
                aria-busy={signingOut}
              >
                {signingOut ? "SIGNING OUT" : "Sign out"}
              </button>
          ) : null}
        </div>
        <ActionProgress overlay active={signingOut} label="SIGNING OUT" />
        {signingOut ? (
          <span className="sr-only" role="status">
            Signing out
          </span>
        ) : null}
      </header>

      <section className="shipments" data-region="shipments-list">
        <div className="shipments-head" data-region="shipments-head">
          <Filter size={12} aria-hidden />
          <span>SHIPMENTS</span>
          <b>{board.shipments.length}</b>
        </div>
        <ul className="console-scroll shipment-rows">
          {shipments.length === 0 ? (
            <li className="empty-row">
              No tracking numbers on this board yet.
            </li>
          ) : (
            shipments.map((item) => {
              const active = item.id === selected?.id;
              const status = item.snapshot?.facts.status ?? item.lastError ?? "QUEUED";
              const tone = item.lastError ? "bad" : statusTone(item.snapshot?.facts.status);
              const lane = [item.snapshot?.facts.origin, item.snapshot?.facts.destination]
                .filter(Boolean)
                .join(" → ");
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`ship-row ${active ? "is-active" : ""}`}
                    onClick={() => selectShipment(item)}
                  >
                    <span className={`ship-num tone-${tone}`}>
                      {formatTracking(item.trackingNumber)}
                    </span>
                    <span className="ship-lane">{lane || "Awaiting FedEx scan data"}</span>
                    <span className={`ship-status tone-${tone}`}>{status}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="ship-tools" data-region="shipments-tools">
          <button type="button" onClick={() => setSort(sort === "time" ? "status" : "time")}>
            SORT
          </button>
          <span>/</span>
          <label className="filter-ctl">
            <Filter size={11} aria-hidden />
            FILTER
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Filter shipments"
            />
          </label>
        </div>
      </section>

      <section className="map-panel">
        <h2 className="panel-title map-title" data-region="map-title">
          LIVE ROUTE TRACKING
        </h2>
        <div className="map-stage" data-region="map-east">
          <RouteMap
            shipment={selected}
            apiKey={mapsKey}
            focusEventId={focusEventId}
            onMapReady={onMapReady}
          />
        </div>
        <div className="map-footer">
          <p className="map-credit" data-region="map-credit">
            Google Maps
          </p>
          <p className="map-legend" data-region="map-legend">
            <span className="legend-mark legend-origin" aria-hidden /> ORIGIN
            <span className="legend-mark legend-scan" aria-hidden /> HISTORY
            <span className="legend-mark legend-dest" aria-hidden /> DEST
          </p>
          <div className="map-tools" data-region="map-tools">
            <button
              type="button"
              className="map-key"
              aria-label="Zoom out"
              onClick={() => {
                const map = mapRef.current;
                if (!map) return;
                map.setZoom((map.getZoom() ?? 4) - 1);
              }}
            >
              −
            </button>
            <button
              type="button"
              className="map-key"
              aria-label="Zoom in"
              onClick={() => {
                const map = mapRef.current;
                if (!map) return;
                map.setZoom((map.getZoom() ?? 4) + 1);
              }}
            >
              +
            </button>
            <button
              type="button"
              className="map-key"
              aria-label="Reset map"
              onClick={() => {
                const map = mapRef.current;
                if (!map) return;
                map.setCenter({ lat: 39.8, lng: -98.5 });
                map.setZoom(4);
              }}
            >
              RESET
            </button>
          </div>
        </div>
      </section>

      <aside className="detail" ref={detailRef}>
        <section className="facts" data-region="facts-grid">
          <h2 className="panel-title" data-region="facts-title">
            SHIPMENT FACTS
          </h2>
          {selected ? (
            <dl>
              {rows.map(([label, value]) => (
                <div key={label} className="fact">
                  <dt>{label}</dt>
                  <dd className={label === "STATUS" ? `tone-${statusTone(String(value))}` : undefined}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="empty-copy">Select a tracking number to load facts from FedEx.</p>
          )}
        </section>
        <section className="history">
          <h2 className="panel-title" data-region="history-title">
            TRAVEL HISTORY
          </h2>
          {(selected?.snapshot?.events ?? []).length === 0 ? (
            <p className="empty-copy">
              {selected?.lastError ??
                "Travel history appears after FedEx returns scan events."}
            </p>
          ) : (
            <ol className="console-scroll history-list history-marks" data-region="history-list">
              {selected?.snapshot?.events.map((event, index, list) => {
                const current = index === list.length - 1;
                const focused = event.id === focusEventId;
                const mark = index < 9 ? String(index + 1) : "•";
                const place =
                  [event.city, event.state].filter(Boolean).join(", ") || "Location pending";
                return (
                  <li key={event.id} className={current ? "is-current" : undefined}>
                    <button
                      type="button"
                      className={`hist-row ${focused ? "is-focused" : ""}`}
                      onClick={() => setFocusEventId(event.id)}
                    >
                      <span className="hist-mark" aria-hidden>
                        {mark}
                      </span>
                      <span className="hist-copy">
                        <span>
                          {formatWhen(event.at)} {event.description}
                        </span>
                        <span className="hist-place">{place}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </aside>
    </main>
  );
}
