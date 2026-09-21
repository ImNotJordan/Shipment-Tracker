"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Filter, Package, ScrollText } from "lucide-react";
import { OpsChrome } from "./OpsChrome";
import { ConfirmProvider, openViewAsTab, useConfirm } from "./ConfirmDialog";
import { pulsePanel, staggerRows } from "@/lib/ops-motion";
import {
  TRACKING_DIGITS,
  caretAfter,
  groupTracking,
  trackingDigits,
} from "@/lib/tracking-number";
import { ActionProgress } from "./ActionProgress";
import { OpsToast, useOpsToast } from "./OpsToast";
import type { AuditRecord, CompanyRecord, SessionUser, ShipmentRecord } from "@/lib/types";

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

export function TrackerConsole(props: {
  user: SessionUser;
  initialCompanies: CompanyRecord[];
  initialShipments: ShipmentRecord[];
  initialAudits: AuditRecord[];
  initialCompanyId: string;
  lockCompany: boolean;
  /** Rendered inside Admin's preview pane, which supplies the chrome. */
  embedded?: boolean;
}) {
  return (
    <ConfirmProvider>
      <TrackerWorkbench {...props} />
    </ConfirmProvider>
  );
}

function TrackerWorkbench({
  user,
  initialCompanies,
  initialShipments,
  initialAudits,
  initialCompanyId,
  lockCompany,
  embedded,
}: {
  user: SessionUser;
  initialCompanies: CompanyRecord[];
  initialShipments: ShipmentRecord[];
  initialAudits: AuditRecord[];
  initialCompanyId: string;
  lockCompany: boolean;
  embedded?: boolean;
}) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [shipments, setShipments] = useState(initialShipments);
  const [audits, setAudits] = useState(initialAudits);
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [selectedId, setSelectedId] = useState<string | null>(initialShipments[0]?.id ?? null);
  // Raw digits only. The grouping a field shows is never what is stored.
  const [numbers, setNumbers] = useState<string[]>([""]);
  const numberRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cueRef = useRef<{ index: number; caret?: number; focus?: boolean } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [switching, setSwitching] = useState(false);
  const viewing = user.role === "admin";
  const confirm = useConfirm();
  const toast = useOpsToast();
  const listRef = useRef<HTMLUListElement>(null);
  const detailRef = useRef<HTMLElement>(null);

  async function load(nextCompany = companyId) {
    const query = nextCompany ? `?companyId=${nextCompany}` : "";
    const res = await fetch(`/api/shipments${query}`);
    const json = await res.json();
    if (!res.ok) {
      toast.show("bad", json.error ?? "Could not load this company's shipments.");
      return;
    }
    if (json.companies) setCompanies(json.companies);
    const nextShipments = json.shipments ?? [];
    setShipments(nextShipments);
    setAudits(json.audits ?? []);
    setSelectedId((current) =>
      nextShipments.some((item: ShipmentRecord) => item.id === current)
        ? current
        : (nextShipments[0]?.id ?? null),
    );
  }

  // Caret and focus are restored after the new value lands, or React's
  // re-render throws the caret to the end of the field on every keystroke.
  useEffect(() => {
    const cue = cueRef.current;
    if (!cue) return;
    cueRef.current = null;
    const field = numberRefs.current[cue.index];
    if (!field) return;
    if (cue.focus) field.focus();
    if (typeof cue.caret === "number") field.setSelectionRange(cue.caret, cue.caret);
  });

  function onNumberChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const field = event.target;
    const typed = field.value.slice(0, field.selectionStart ?? field.value.length);
    const digits = trackingDigits(field.value);
    cueRef.current = {
      index,
      caret: caretAfter(Math.min(trackingDigits(typed).length, digits.length)),
    };
    setNumbers((current) => current.map((item, i) => (i === index ? digits : item)));
  }

  function onNumberKey(index: number, event: KeyboardEvent<HTMLInputElement>) {
    const digits = numbers[index] ?? "";
    if (event.key === "Enter") {
      // A field never submits the form: Enter is how you reach the next number.
      event.preventDefault();
      if (digits.length < TRACKING_DIGITS) return;
      cueRef.current = { index: index + 1, focus: true };
      if (index === numbers.length - 1) setNumbers((current) => [...current, ""]);
      else numberRefs.current[index + 1]?.focus();
      return;
    }
    if (event.key === "Backspace" && !digits && numbers.length > 1) {
      event.preventDefault();
      cueRef.current = { index: Math.max(0, index - 1), focus: true };
      setNumbers((current) => current.filter((_, i) => i !== index));
    }
  }

  useEffect(() => {
    if (initialCompanyId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const rows = listRef.current?.querySelectorAll(".ops-row") ?? [];
      staggerRows([...rows]);
    });
    return () => cancelAnimationFrame(id);
  }, [companyId]);

  async function onCompany(id: string) {
    if (lockCompany || id === companyId) return;
    setSwitching(true);
    setShipments([]);
    setAudits([]);
    setSelectedId(null);
    setCompanyId(id);
    // The choice goes into the URL, so a reload, a shared link and the admin
    // preview all land on this company instead of the server default. Pushed
    // with replaceState rather than the router so the page is not refetched
    // on top of the load below.
    const url = new URL(window.location.href);
    url.searchParams.set("companyId", id);
    window.history.replaceState(null, "", url);
    try {
      await load(id);
    } finally {
      setSwitching(false);
    }
    pulsePanel(detailRef.current);
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (viewing) return;
    const entered = numbers.filter(Boolean);
    if (!entered.length) return;
    const okAdd = await confirm({
      title: "ADD TO BOARD",
      body: `Attach ${entered.length} FedEx number${entered.length === 1 ? "" : "s"} to this company and fetch live status?`,
      confirmLabel: "ADD",
    });
    if (!okAdd) return;
    setPending(true);
    const res = await fetch("/api/shipments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId, trackingNumbers: entered }),
    });
    const json = await res.json();
    setPending(false);
    if (!res.ok) {
      toast.show("bad", json.error ?? "Could not add tracking numbers.");
      return;
    }
    const count = json.created?.length ?? 0;
    toast.show(
      "ok",
      count
        ? `Attached ${count} FedEx number${count === 1 ? "" : "s"} and requested live status.`
        : "Those numbers were already on the board.",
    );
    setNumbers([""]);
    await load(companyId);
    pulsePanel(detailRef.current);
  }

  async function onRefresh(id: string) {
    if (viewing) return;
    const okRefresh = await confirm({
      title: "REFRESH",
      body: "Fetch live FedEx status for this tracking number?",
      confirmLabel: "REFRESH",
    });
    if (!okRefresh) return;
    const res = await fetch(`/api/shipments/${id}?action=refresh&companyId=${companyId}`, {
      method: "POST",
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) toast.show("bad", json.error ?? "Could not refresh FedEx status.");
    else toast.show("ok", "FedEx status refreshed.");
    await load(companyId);
  }

  async function onDelete(id: string) {
    if (viewing) return;
    const okRemove = await confirm({
      title: "REMOVE NUMBER",
      body: "Remove this tracking number from the live board? This cannot be undone.",
      confirmLabel: "REMOVE",
      danger: true,
    });
    if (!okRemove) return;
    const res = await fetch(`/api/shipments/${id}?companyId=${companyId}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) toast.show("bad", json.error ?? "Could not remove.");
    else toast.show("ok", "Tracking number removed.");
    await load(companyId);
  }

  async function onSaveNumber(id: string) {
    if (viewing) return;
    const trackingNumber = edits[id];
    if (!trackingNumber?.trim()) return;
    const okSave = await confirm({
      title: "SAVE NUMBER",
      body: `Replace this tracking number with ${trackingNumber.trim()}?`,
      confirmLabel: "SAVE",
    });
    if (!okSave) return;
    const res = await fetch(`/api/shipments/${id}?companyId=${companyId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackingNumber }),
    });
    const json = await res.json();
    if (!res.ok) toast.show("bad", json.error ?? "Could not edit tracking number.");
    else {
      setEdits((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      toast.show("ok", "Tracking number updated.");
    }
    await load(companyId);
  }

  const selectedCompany = companies.find((item) => item.id === companyId);
  const selected = shipments.find((item) => item.id === selectedId) ?? null;

  return (
    <>
      <OpsToast toast={toast.toast} onDismiss={toast.dismiss} />
      <OpsChrome user={user} station="TRACKER" clientSlug={selectedCompany?.slug} brand={selectedCompany} embedded={embedded}>
      <section className="ops-dock">
        <div className="ops-tools">
          <Package size={12} aria-hidden />
          <span>ATTACH</span>
        </div>
        <form className="ops-form" onSubmit={onAdd}>
          <h2>FedEx numbers</h2>
          <p>
            {viewing
              ? "Viewing only. Tracker actions are locked in this tab."
              : "Add, edit, or remove tracking numbers for this company only. Every change is written to the audit log."}
          </p>
          <label>
            COMPANY
            <select
              value={companyId}
              onChange={(event) => void onCompany(event.target.value)}
              disabled={lockCompany}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
          <p className="ops-field-label">TRACKING NUMBERS</p>
          <div className="ops-numbers">
            {numbers.map((digits, index) => (
              <input
                key={index}
                ref={(node) => {
                  numberRefs.current[index] = node;
                }}
                value={groupTracking(digits)}
                onChange={(event) => onNumberChange(index, event)}
                onKeyDown={(event) => onNumberKey(index, event)}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                placeholder="8771 1477 9998"
                aria-label={`FedEx tracking number ${index + 1}`}
                disabled={viewing}
              />
            ))}
            <p className="ops-meta">
              {TRACKING_DIGITS} digits. Press Enter on a full number to add another.
            </p>
          </div>
          <button
            className="primary"
            type="submit"
            disabled={pending || viewing || !numbers.some(Boolean)}
          >
            {pending ? "FETCHING FEDEX" : "ADD TO BOARD"}
          </button>
        </form>
      </section>

      <section className="ops-stage">
        <ActionProgress overlay inset active={switching} label="LOADING COMPANY" />
        <div className="shipments-head">
          <Filter size={12} aria-hidden />
          <span>{selectedCompany ? selectedCompany.name.toUpperCase() : "SHIPMENTS"}</span>
          <b>{shipments.length}</b>
          {selectedCompany && !embedded ? (
            <button
              type="button"
              className="ops-open"
              onClick={() =>
                void (async () => {
                  const okOpen = await confirm({
                    title: "VIEW AS CLIENT",
                    body: "Opens this company's live board in a new tab, as a client would see it. Close preview there to return here.",
                    confirmLabel: "OPEN TAB",
                  });
                  if (okOpen) openViewAsTab(`/track/${selectedCompany.slug}`);
                })()
              }
            >
              VIEW AS CLIENT
            </button>
          ) : null}
        </div>
        <ul ref={listRef} className="console-scroll ops-rows">
          {shipments.length === 0 ? (
            <li className="empty-row">No tracking numbers on this board yet.</li>
          ) : (
            shipments.map((item) => {
              const active = item.id === selected?.id;
              const status = item.snapshot?.facts.status ?? item.lastError ?? "QUEUED";
              const tone = item.lastError ? "bad" : statusTone(item.snapshot?.facts.status);
              const dirty = Boolean(edits[item.id] && edits[item.id] !== item.trackingNumber);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`ops-row ${active ? "is-active" : ""}`}
                    onClick={() => {
                      setSelectedId(item.id);
                      pulsePanel(detailRef.current);
                    }}
                  >
                    <span className={`ship-num tone-${tone}`}>
                      {item.trackingNumber.replace(/(.{4})/g, "$1 ").trim()}
                    </span>
                    <span className={`ship-status tone-${tone}`}>{status}</span>
                  </button>
                  {active ? (
                    <div className="ops-row-tools">
                      <input
                        value={edits[item.id] ?? item.trackingNumber}
                        onChange={(event) =>
                          setEdits((current) => ({
                            ...current,
                            [item.id]: trackingDigits(event.target.value),
                          }))
                        }
                        inputMode="numeric"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={TRACKING_DIGITS}
                        aria-label={`Edit ${item.trackingNumber}`}
                        disabled={viewing}
                      />
                      {dirty && !viewing ? (
                        <button className="ops-key" type="button" onClick={() => onSaveNumber(item.id)}>
                          SAVE
                        </button>
                      ) : null}
                      <button
                        className="ops-key"
                        type="button"
                        onClick={() => onRefresh(item.id)}
                        disabled={viewing}
                      >
                        REFRESH
                      </button>
                      <button
                        className="danger"
                        type="button"
                        onClick={() => onDelete(item.id)}
                        disabled={viewing}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </section>

      <aside className="ops-detail" ref={detailRef}>
        <section className="history">
          <h2 className="panel-title">
            <ScrollText size={12} aria-hidden /> AUDIT LOG
          </h2>
          {audits.length === 0 ? (
            <p className="empty-copy">No tracking changes recorded yet.</p>
          ) : (
            <ol className="console-scroll history-list">
              {audits.map((item, index) => {
                const current = index === 0;
                return (
                  <li key={item.id} className={current ? "is-current" : undefined}>
                    <span className="node" />
                    <div>
                      <p>
                        {new Date(item.at).toLocaleString()} {item.action.toUpperCase()}
                      </p>
                      <p className="hist-place">
                        {item.actorEmail} · {item.detail}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </aside>
      </OpsChrome>
    </>
  );
}
