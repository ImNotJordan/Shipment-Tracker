"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Building2, Users } from "lucide-react";
import { OpsChrome } from "./OpsChrome";
import { ConfirmProvider, openViewAsTab, useConfirm } from "./ConfirmDialog";
import { pulsePanel, staggerRows } from "@/lib/ops-motion";
import { parseEmailList } from "@/lib/emails";
import { normalizePhone, phoneProblem } from "@/lib/phones";
import { BusyControl } from "./ActionProgress";
import { OpsToast, useOpsToast } from "./OpsToast";
import type { CompanyRecord, Role, SessionUser, UserRecord } from "@/lib/types";

type UserEdit = {
  role: Role;
  companyId: string;
  phone: string;
};

function draftFor(row: UserRecord, edits: Record<string, UserEdit>): UserEdit {
  return (
    edits[row.id] ?? {
      role: row.role,
      companyId: row.companyId ?? "",
      phone: row.phone ?? "",
    }
  );
}

function draftDirty(row: UserRecord, edit: UserEdit) {
  const nextPhone = edit.role === "client" ? normalizePhone(edit.phone) : null;
  const nextCompany = edit.role === "admin" ? null : edit.companyId || null;
  const phoneInvalid = edit.role === "client" && Boolean(edit.phone.trim()) && !nextPhone;
  return (
    phoneInvalid ||
    edit.role !== row.role ||
    nextCompany !== (row.companyId ?? null) ||
    nextPhone !== (row.phone ?? null)
  );
}

function downloadPdf(base64: string, email: string) {
  const url = pdfUrlFromBase64(base64);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${email.replace(/[^a-z0-9]+/gi, "-")}-live-board-credentials.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

function pdfUrlFromBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

export function AdminConsole(props: {
  user: SessionUser;
  initialCompanies: CompanyRecord[];
  initialUsers: UserRecord[];
}) {
  return (
    <ConfirmProvider>
      <AdminWorkbench {...props} />
    </ConfirmProvider>
  );
}

function AdminWorkbench({
  user,
  initialCompanies,
  initialUsers,
}: {
  user: SessionUser;
  initialCompanies: CompanyRecord[];
  initialUsers: UserRecord[];
}) {
  const [tab, setTab] = useState<"companies" | "users">("companies");
  const [companies, setCompanies] = useState(initialCompanies);
  const [users, setUsers] = useState(initialUsers);
  const [selectedId, setSelectedId] = useState<string | null>(initialCompanies[0]?.id ?? null);
  const [name, setName] = useState("");
  const [invite, setInvite] = useState({
    email: "",
    name: "",
    role: "client" as Role,
    companyId: initialCompanies[0]?.id ?? "",
    cc: "",
    phone: "",
  });
  const [branding, setBranding] = useState<Record<string, { accent: string; background: string }>>(
    Object.fromEntries(
      initialCompanies.map((company) => [
        company.id,
        { accent: company.accent, background: company.background },
      ]),
    ),
  );
  const [notify, setNotify] = useState<Record<string, { enabled: boolean; cc: string }>>(
    Object.fromEntries(
      initialCompanies.map((company) => [
        company.id,
        { enabled: company.notifyEnabled !== false, cc: (company.notifyCc ?? []).join("\n") },
      ]),
    ),
  );
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [edits, setEdits] = useState<Record<string, UserEdit>>({});
  const [busy, setBusy] = useState<{
    key: "create" | "notify" | "invite" | "save" | "sms" | "delete";
    id?: string;
    label: string;
    value?: number;
  } | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const confirm = useConfirm();
  const toast = useOpsToast();
  const [pdfPreview, setPdfPreview] = useState<{ url: string; email: string } | null>(null);

  async function load() {
    const [companyRes, userRes] = await Promise.all([
      fetch("/api/companies"),
      fetch("/api/users"),
    ]);
    const companyJson = await companyRes.json();
    const userJson = await userRes.json();
    setCompanies(companyJson.companies ?? []);
    setUsers(userJson.users ?? []);
    setEmailConfigured(Boolean(companyJson.emailConfigured));
    setSmsConfigured(Boolean(companyJson.smsConfigured));
    setNotify(
      Object.fromEntries(
        (companyJson.companies ?? []).map((company: CompanyRecord) => [
          company.id,
          { enabled: company.notifyEnabled !== false, cc: (company.notifyCc ?? []).join("\n") },
        ]),
      ),
    );
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    return () => {
      if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    };
  }, [pdfPreview]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const rows = listRef.current?.querySelectorAll(".ops-row") ?? [];
      staggerRows([...rows]);
    });
    return () => cancelAnimationFrame(id);
  }, [tab]);

  function selectCompany(id: string) {
    setSelectedId(id);
    pulsePanel(detailRef.current);
  }

  function switchTab(next: "companies" | "users") {
    setTab(next);
    pulsePanel(detailRef.current);
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const okCreate = await confirm({
      title: "CREATE COMPANY",
      body: `Create ${name.trim() || "this company"} and its live board?`,
      confirmLabel: "CREATE",
    });
    if (!okCreate) return;
    setBusy({ key: "create", label: "CREATING COMPANY" });
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.show("bad", json.error ?? "Could not create company.");
        return;
      }
      setName("");
      toast.show("ok", `${json.company.name} is ready at /track/${json.company.slug}`);
      setSelectedId(json.company.id);
      await load();
      pulsePanel(detailRef.current);
    } finally {
      setBusy(null);
    }
  }

  async function onDeleteCompany(id: string) {
    const company = companies.find((item) => item.id === id);
    const okDelete = await confirm({
      title: "DELETE COMPANY",
      body: `Remove ${company?.name ?? "this company"} and its board? This cannot be undone.`,
      confirmLabel: "DELETE",
      danger: true,
    });
    if (!okDelete) return;
    setBusy({ key: "delete", id, label: "DELETING COMPANY" });
    try {
      const res = await fetch(`/api/companies/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        toast.show("bad", json.error ?? "Could not delete company.");
        return;
      }
      setSelectedId((current) => (current === id ? null : current));
      toast.show("ok", `${company?.name ?? "Company"} removed.`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function onSaveNotify(company: CompanyRecord) {
    const settings = notify[company.id] ?? { enabled: true, cc: "" };
    const okSave = await confirm({
      title: "SAVE EMAIL UPDATES",
      body: settings.enabled
        ? `Send FedEx tracking updates for ${company.name} to client accounts, with the CC list saved here?`
        : `Stop sending FedEx tracking update emails for ${company.name}?`,
      confirmLabel: "SAVE",
    });
    if (!okSave) return;
    setBusy({ key: "notify", label: "SAVING EMAIL UPDATES" });
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notifyEnabled: settings.enabled,
          notifyCc: parseEmailList(settings.cc),
        }),
      });
      const json = await res.json();
      if (!res.ok) toast.show("bad", json.error ?? "Could not save email updates.");
      else toast.show("ok", `Saved client update emails for ${company.name}.`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function onSendTestSms(company: CompanyRecord) {
    const okSend = await confirm({
      title: "SEND TEST SMS",
      body: `Text every saved client phone for ${company.name} from the OpenPhone number?`,
      confirmLabel: "SEND",
    });
    if (!okSend) return;
    setBusy({ key: "sms", id: company.id, label: "SENDING SMS" });
    try {
      const res = await fetch(`/api/companies/${company.id}/sms`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) toast.show("bad", json.error ?? "Could not send SMS.");
      else {
        const phones = Array.isArray(json.phones) ? json.phones.join(", ") : "client phones";
        toast.show("ok", `SMS sent to ${phones}.`);
      }
    } finally {
      setBusy(null);
    }
  }

  async function onSaveBrand(company: CompanyRecord) {
    const okSave = await confirm({
      title: "SAVE COLORS",
      body: `Update live-board colors for ${company.name}?`,
      confirmLabel: "SAVE",
    });
    if (!okSave) return;
    const colors = branding[company.id] ?? {
      accent: company.accent,
      background: company.background,
    };
    const res = await fetch(`/api/companies/${company.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: company.name,
        accent: colors.accent,
        background: colors.background,
      }),
    });
    const json = await res.json();
    if (!res.ok) toast.show("bad", json.error ?? "Could not save board colors.");
    else toast.show("ok", `Updated ${company.name} board colors.`);
    await load();
  }

  async function onLogo(companyId: string, file: File | undefined) {
    if (!file) return;
    const okLogo = await confirm({
      title: "UPDATE LOGO",
      body: `Replace this company's board logo with ${file.name}?`,
      confirmLabel: "UPLOAD",
    });
    if (!okLogo) return;
    const data = new FormData();
    data.set("logo", file);
    const res = await fetch(`/api/companies/${companyId}/logo`, { method: "POST", body: data });
    const json = await res.json();
    if (!res.ok) toast.show("bad", json.error ?? "Could not upload logo.");
    else toast.show("ok", "Logo updated.");
    await load();
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    const ccList = parseEmailList(invite.cc);
    if (invite.role === "client" && invite.phone.trim() && phoneProblem(invite.phone)) {
      toast.show("bad", phoneProblem(invite.phone) ?? "Invalid phone.");
      return;
    }
    setBusy({ key: "invite", label: "CREATING ACCOUNT", value: 0.22 });
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: invite.email,
          name: invite.name,
          role: invite.role,
          companyId: invite.role === "admin" ? null : invite.companyId,
          phone: invite.role === "client" ? invite.phone : "",
          cc: ccList,
          sendEmail: false,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.show("bad", json.error ?? "Could not invite user.");
        return;
      }
      if (json.smsError) toast.show("bad", json.smsError);
      else if (json.smsSent) toast.show("ok", `Invite SMS sent to ${invite.phone}.`);
      const pdfBase64 = json.pdfBase64 as string | undefined;
      const previewUrl = pdfBase64 ? pdfUrlFromBase64(pdfBase64) : "";
      if (previewUrl) {
        setPdfPreview({
          url: previewUrl,
          email: json.user?.email ?? invite.email,
        });
      }
      await load();
      setBusy(null);
      const okSend = await confirm({
        title: "INVITE USER",
        body: ccList.length
          ? `Account created. Email this PDF to ${json.user?.email ?? invite.email}, with CC to ${ccList.join(", ")}?`
          : `Account created. Email this PDF to ${json.user?.email ?? invite.email}?`,
        confirmLabel: "INVITE",
        previewSrc: previewUrl || undefined,
        previewLabel: "CREDENTIALS PDF",
      });
      if (okSend) {
        setBusy({ key: "invite", label: "EMAILING PDF", value: 0.72 });
        const mailRes = await fetch("/api/users/invite-mail", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: json.user?.email ?? invite.email,
            name: invite.name,
            role: invite.role,
            companyName: json.companyName,
            password: json.password,
            pdfBase64,
            cc: ccList,
            signInUrl: json.signInUrl,
          }),
        });
        const mailJson = await mailRes.json();
        if (!mailRes.ok) {
          toast.show("bad", mailJson.error ?? "User created, but the email did not send.");
        } else {
          const copied = ccList.length ? ` CC ${ccList.join(", ")}.` : "";
          toast.show(
            "ok",
            `Credentials emailed to ${json.user?.email ?? invite.email}.${copied}`,
          );
        }
      } else {
        toast.show("ok", "User created. Email not sent. Review the PDF in the side panel.");
      }
      if (pdfBase64) downloadPdf(pdfBase64, json.user?.email ?? invite.email);
      setInvite({ ...invite, email: "", name: "", phone: "" });
    } finally {
      setBusy(null);
    }
  }

  async function onRevoke(id: string) {
    const row = users.find((item) => item.id === id);
    const okRevoke = await confirm({
      title: "REVOKE ACCESS",
      body: `Revoke Live Board access for ${row?.email ?? "this user"}? They stay in the directory as REVOKED.`,
      confirmLabel: "REVOKE",
      danger: true,
    });
    if (!okRevoke) return;
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ disabled: true }),
    });
    const json = await res.json();
    if (!res.ok) toast.show("bad", json.error ?? "Could not revoke.");
    else toast.show("ok", `Access revoked for ${row?.email ?? "user"}.`);
    await load();
  }

  async function onDeleteUser(id: string) {
    const row = users.find((item) => item.id === id);
    const okDelete = await confirm({
      title: "DELETE USER",
      body: `Remove ${row?.email ?? "this user"} from Live Board and delete their Firebase Authentication account? They will not be able to sign in. You can invite this email again afterward.`,
      confirmLabel: "DELETE",
      danger: true,
    });
    if (!okDelete) return;
    setBusy({ key: "delete", id, label: "DELETING USER" });
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        toast.show("bad", json.error ?? "Could not delete user.");
        return;
      }
      toast.show("ok", `${row?.email ?? "User"} deleted.`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  function patchEdit(id: string, patch: Partial<UserEdit>) {
    setEdits((current) => {
      const row = users.find((item) => item.id === id);
      if (!row) return current;
      return { ...current, [id]: { ...draftFor(row, current), ...patch } };
    });
  }

  async function onSaveUser(id: string) {
    const row = users.find((item) => item.id === id);
    if (!row) return;
    const edit = draftFor(row, edits);
    const nextPhone = edit.role === "client" ? normalizePhone(edit.phone) : null;
    const nextCompany = edit.role === "admin" ? null : edit.companyId || null;
    if (edit.role === "client" && edit.phone.trim() && !nextPhone) {
      toast.show("bad", phoneProblem(edit.phone) ?? "Invalid phone.");
      return;
    }
    if (edit.role !== "admin" && !nextCompany) {
      toast.show("bad", "Tracker and client accounts must be assigned to a company.");
      return;
    }
    if (!draftDirty(row, edit)) return;

    const changes: string[] = [];
    if (edit.role !== row.role) changes.push(`role to ${edit.role}`);
    if (nextCompany !== (row.companyId ?? null)) {
      const companyName =
        companies.find((item) => item.id === nextCompany)?.name ?? "another company";
      changes.push(edit.role === "admin" ? "all companies" : `company to ${companyName}`);
    }
    if (nextPhone !== (row.phone ?? null)) {
      changes.push(nextPhone ? `SMS number to ${nextPhone}` : "clear the SMS number");
    }
    const okSave = await confirm({
      title: "SAVE USER",
      body: `Save ${changes.join(", ")} for ${row.email}?`,
      confirmLabel: "SAVE",
    });
    if (!okSave) return;

    setBusy({ key: "save", id, label: "SAVING USER" });
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: edit.role,
          companyId: nextCompany,
          phone: nextPhone,
        }),
      });
      const json = await res.json();
      if (!res.ok) toast.show("bad", json.error ?? "Could not save user.");
      else {
        setEdits((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        toast.show("ok", `Saved ${row.email}.`);
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  const selected = companies.find((item) => item.id === selectedId) ?? null;
  const colors = selected
    ? (branding[selected.id] ?? { accent: selected.accent, background: selected.background })
    : null;
  const mail = selected
    ? (notify[selected.id] ?? {
        enabled: selected.notifyEnabled !== false,
        cc: (selected.notifyCc ?? []).join("\n"),
      })
    : null;
  const clientRecipients = selected
    ? users
        .filter(
          (row) =>
            row.role === "client" && row.companyId === selected.id && !row.disabled,
        )
        .map((row) => row.email)
    : [];
  const clientPhones = selected
    ? users
        .filter(
          (row) =>
            row.role === "client" &&
            row.companyId === selected.id &&
            !row.disabled &&
            row.phone,
        )
        .map((row) => row.phone as string)
    : [];

  return (
    <>
      <OpsToast toast={toast.toast} onDismiss={toast.dismiss} />
      <OpsChrome user={user} station="ADMIN" clientSlug={selected?.slug}>
      <section className="ops-dock">
        <div className="ops-tools">
          <button
            type="button"
            className={tab === "companies" ? "is-on" : undefined}
            onClick={() => switchTab("companies")}
          >
            <Building2 size={12} aria-hidden />
            COMPANIES
          </button>
          <span>/</span>
          <button
            type="button"
            className={tab === "users" ? "is-on" : undefined}
            onClick={() => switchTab("users")}
          >
            <Users size={12} aria-hidden />
            USERS
          </button>
        </div>
        {tab === "companies" ? (
          <form className="ops-form" onSubmit={onCreate}>
            <h2>Create company</h2>
            <p>Each company is a sealed tenant. Clients only see their own live board.</p>
            <label>
              COMPANY NAME
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ronin"
                required
                disabled={busy?.key === "create"}
              />
            </label>
            <BusyControl
              active={busy?.key === "create"}
              label={busy?.key === "create" ? busy.label : "Creating company"}
            >
              <button className="primary" type="submit" disabled={busy?.key === "create"}>
                {busy?.key === "create" ? busy.label : "CREATE COMPANY"}
              </button>
            </BusyControl>
          </form>
        ) : (
          <form className="ops-form" onSubmit={onInvite}>
            <h2>Invite user</h2>
            <p>
              {emailConfigured
                ? "Creates the account, emails the credentials PDF (with optional CC), and downloads a copy here."
                : "Creates the account and downloads a credentials PDF. Add RESEND_API_KEY to email invites."}
            </p>
            <label>
              NAME
              <input
                value={invite.name}
                onChange={(event) => setInvite({ ...invite, name: event.target.value })}
                disabled={busy?.key === "invite"}
              />
            </label>
            <label>
              EMAIL
              <input
                type="email"
                value={invite.email}
                onChange={(event) => setInvite({ ...invite, email: event.target.value })}
                required
                disabled={busy?.key === "invite"}
              />
            </label>
            <label>
              ROLE
              <select
                value={invite.role}
                onChange={(event) => setInvite({ ...invite, role: event.target.value as Role })}
                disabled={busy?.key === "invite"}
              >
                <option value="client">Client — live board only</option>
                <option value="tracker">Tracker — tracking numbers + audit log</option>
                <option value="admin">Admin — companies, users, branding</option>
              </select>
            </label>
            {invite.role === "client" ? (
              <label>
                PHONE
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={invite.phone}
                  onChange={(event) => setInvite({ ...invite, phone: event.target.value })}
                  placeholder="+63917xxxxxxx"
                  disabled={busy?.key === "invite"}
                />
              </label>
            ) : null}
            {invite.role === "admin" ? null : (
              <label>
                COMPANY
                <select
                  value={invite.companyId}
                  onChange={(event) => setInvite({ ...invite, companyId: event.target.value })}
                  required
                  disabled={busy?.key === "invite"}
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              CC EMAILS
              <textarea
                className="ops-cc"
                value={invite.cc}
                disabled={busy?.key === "invite"}
                onChange={(event) => setInvite({ ...invite, cc: event.target.value })}
                placeholder={"ops@company.com\nwarehouse@company.com"}
              />
            </label>
            <BusyControl
              active={busy?.key === "invite"}
              label={busy?.key === "invite" ? busy.label : "Inviting user"}
              value={busy?.key === "invite" ? busy.value : undefined}
            >
              <button className="primary" type="submit" disabled={busy?.key === "invite"}>
                {busy?.key === "invite" ? busy.label : "INVITE AND EMAIL PDF"}
              </button>
            </BusyControl>
          </form>
        )}
      </section>

      <section className="ops-stage">
        <div className="shipments-head">
          {tab === "companies" ? <Building2 size={12} aria-hidden /> : <Users size={12} aria-hidden />}
          <span>{tab === "companies" ? "BOARDS" : "DIRECTORY"}</span>
          <b>{tab === "companies" ? companies.length : users.length}</b>
        </div>
        {tab === "companies" ? (
          <ul ref={listRef} className="console-scroll ops-rows">
            {companies.length === 0 ? (
              <li className="empty-row">No companies yet. Create one in the dock.</li>
            ) : (
              companies.map((company) => {
                const active = company.id === selected?.id;
                const deleting = busy?.key === "delete" && busy.id === company.id;
                return (
                  <li key={company.id}>
                    <button
                      type="button"
                      className={`ops-row ${active ? "is-active" : ""}`}
                      onClick={() => selectCompany(company.id)}
                    >
                      <span className="ship-num">{company.name}</span>
                      <span className="ship-lane">/track/{company.slug}</span>
                      <span className="ship-status">{company.logoUrl ? "LOGO" : "NO LOGO"}</span>
                    </button>
                    <div className="ops-row-tools">
                      {company.slug === "ronin" ? (
                        <span className="ops-meta">SEED BOARD — CANNOT DELETE</span>
                      ) : (
                        <button
                          className="danger"
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => onDeleteCompany(company.id)}
                        >
                          {deleting ? busy.label : "Delete company"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        ) : (
          <ul ref={listRef} className="console-scroll ops-rows">
            {users.length === 0 ? (
              <li className="empty-row">No users yet. Invite from the dock.</li>
            ) : (
              users.map((row) => {
                const edit = draftFor(row, edits);
                const dirty = draftDirty(row, edit);
                const locked = row.id === user.id || Boolean(busy);
                return (
                <li key={row.id} className={row.disabled ? "is-revoked" : undefined}>
                  <div className="ops-row ops-row-static">
                    <span className="ship-num">
                      {row.name || row.email}
                      {row.disabled ? " · REVOKED" : ""}
                    </span>
                    <span className="ship-lane">
                      {row.email}
                      {row.phone ? ` · ${row.phone}` : ""}
                    </span>
                    <span className="ship-status">{row.role}</span>
                  </div>
                  <div className="ops-row-tools">
                    <select
                      value={edit.role}
                      disabled={locked}
                      aria-label={`Role for ${row.email}`}
                      onChange={(event) => {
                        const role = event.target.value as Role;
                        patchEdit(row.id, {
                          role,
                          companyId:
                            role === "admin"
                              ? ""
                              : edit.companyId || row.companyId || companies[0]?.id || "",
                          phone: role === "client" ? edit.phone : "",
                        });
                      }}
                    >
                      <option value="client">client</option>
                      <option value="tracker">tracker</option>
                      <option value="admin">admin</option>
                    </select>
                    {edit.role === "client" ? (
                      <input
                        type="tel"
                        inputMode="tel"
                        value={edit.phone}
                        aria-label={`Phone for ${row.email}`}
                        placeholder="+63917xxxxxxx"
                        disabled={locked}
                        onChange={(event) => patchEdit(row.id, { phone: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void onSaveUser(row.id);
                          }
                        }}
                      />
                    ) : null}
                    {edit.role === "admin" ? (
                      <span className="ops-meta">ALL COMPANIES</span>
                    ) : (
                      <select
                        value={edit.companyId}
                        aria-label={`Company for ${row.email}`}
                        disabled={locked}
                        onChange={(event) => patchEdit(row.id, { companyId: event.target.value })}
                      >
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {row.id === user.id ? (
                      <span className="ops-meta">YOU</span>
                    ) : (
                      <>
                        <button
                          className="ops-key"
                          type="button"
                          disabled={!dirty || Boolean(busy)}
                          onClick={() => void onSaveUser(row.id)}
                        >
                          {busy?.key === "save" && busy.id === row.id ? busy.label : "SAVE"}
                        </button>
                        {row.disabled ? null : (
                          <button
                            className="danger"
                            type="button"
                            disabled={Boolean(busy)}
                            onClick={() => onRevoke(row.id)}
                          >
                            Revoke
                          </button>
                        )}
                        <button
                          className="danger"
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => onDeleteUser(row.id)}
                        >
                          {busy?.key === "delete" && busy.id === row.id ? busy.label : "Delete"}
                        </button>
                      </>
                    )}
                  </div>
                </li>
                );
              })
            )}
          </ul>
        )}
      </section>

      <aside className="ops-detail" ref={detailRef}>
        {tab === "companies" ? (
          selected && colors ? (
            <section className="facts">
              <h2 className="panel-title">BOARD FACE</h2>
              <dl>
                <div className="fact">
                  <dt>NAME</dt>
                  <dd>{selected.name}</dd>
                </div>
                <div className="fact">
                  <dt>URL</dt>
                  <dd>
                    <button
                      type="button"
                      className="ops-open ops-open-inline"
                      onClick={() =>
                        void (async () => {
                          const okOpen = await confirm({
                            title: "VIEW AS CLIENT",
                            body: "Opens this company's live board in a new tab, as a client would see it. Close preview there to return here.",
                            confirmLabel: "OPEN TAB",
                          });
                          if (okOpen) openViewAsTab(`/track/${selected.slug}`);
                        })()
                      }
                    >
                      /track/{selected.slug}
                    </button>
                  </dd>
                </div>
              </dl>
              <div className="ops-danger">
                {selected.slug === "ronin" ? (
                  <p className="ops-meta">Ronin is the seed board and cannot be deleted.</p>
                ) : (
                  <>
                    <p className="ops-meta">
                      Deletes this tenant, its shipments, and its audit log. Assigned users are revoked.
                    </p>
                    <BusyControl
                      active={busy?.key === "delete" && busy.id === selected.id}
                      label={busy?.key === "delete" ? busy.label : "Deleting company"}
                    >
                      <button
                        className="danger"
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => onDeleteCompany(selected.id)}
                      >
                        {busy?.key === "delete" && busy.id === selected.id
                          ? busy.label
                          : "Delete company"}
                      </button>
                    </BusyControl>
                  </>
                )}
              </div>
              <div className="ops-brand">
                <label>
                  ACCENT
                  <input
                    type="color"
                    value={colors.accent}
                    onChange={(event) =>
                      setBranding((current) => ({
                        ...current,
                        [selected.id]: { ...colors, accent: event.target.value },
                      }))
                    }
                  />
                </label>
                <label>
                  BACKGROUND
                  <input
                    type="color"
                    value={colors.background}
                    onChange={(event) =>
                      setBranding((current) => ({
                        ...current,
                        [selected.id]: { ...colors, background: event.target.value },
                      }))
                    }
                  />
                </label>
                <button className="ops-key" type="button" onClick={() => onSaveBrand(selected)}>
                  SAVE COLORS
                </button>
                <label className="ops-file">
                  LOGO
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(event) => onLogo(selected.id, event.target.files?.[0])}
                  />
                </label>
                {selected.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.logoUrl} alt="" className="ops-logo" />
                ) : (
                  <p className="empty-copy">No logo on this board yet.</p>
                )}
                {mail ? (
                  <div className="ops-notify">
                    <h3>CLIENT UPDATES</h3>
                    <p>
                      {emailConfigured || smsConfigured
                        ? [
                            emailConfigured
                              ? "Each new FedEx scan emails every Client and the CC list from updates@rahyo.com."
                              : null,
                            smsConfigured
                              ? "The same scan is also texted from OpenPhone to every saved client phone."
                              : "Add OPENPHONE_API_KEY and OPENPHONE_FROM to send SMS.",
                          ]
                            .filter(Boolean)
                            .join(" ")
                        : "Add RESEND_API_KEY to email, and OPENPHONE_API_KEY plus OPENPHONE_FROM to text. Settings still save."}
                    </p>
                    <label className="ops-check">
                      <input
                        type="checkbox"
                        checked={mail.enabled}
                        disabled={busy?.key === "notify"}
                        onChange={(event) =>
                          setNotify((current) => ({
                            ...current,
                            [selected.id]: { ...mail, enabled: event.target.checked },
                          }))
                        }
                      />
                      SEND FEDEX UPDATES
                    </label>
                    <p className="ops-meta">
                      TO CLIENTS: {clientRecipients.length ? clientRecipients.join(", ") : "none invited yet"}
                    </p>
                    <p className="ops-meta">
                      SMS: {clientPhones.length ? clientPhones.join(", ") : "no client phones yet"}
                    </p>
                    {smsConfigured ? (
                      <BusyControl
                        active={busy?.key === "sms" && busy.id === selected.id}
                        label={busy?.key === "sms" ? busy.label : "Sending SMS"}
                      >
                        <button
                          className="ops-key"
                          type="button"
                          disabled={Boolean(busy) || !clientPhones.length}
                          onClick={() => onSendTestSms(selected)}
                        >
                          {busy?.key === "sms" && busy.id === selected.id
                            ? busy.label
                            : "SEND TEST SMS"}
                        </button>
                      </BusyControl>
                    ) : null}
                    <label>
                      CC EMAILS
                      <textarea
                        value={mail.cc}
                        disabled={busy?.key === "notify"}
                        onChange={(event) =>
                          setNotify((current) => ({
                            ...current,
                            [selected.id]: { ...mail, cc: event.target.value },
                          }))
                        }
                        placeholder={"ops@company.com\nwarehouse@company.com"}
                      />
                    </label>
                    <BusyControl
                      active={busy?.key === "notify"}
                      label={busy?.key === "notify" ? busy.label : "Saving email updates"}
                    >
                      <button
                        className="ops-key"
                        type="button"
                        disabled={busy?.key === "notify"}
                        onClick={() => onSaveNotify(selected)}
                      >
                        {busy?.key === "notify" ? busy.label : "SAVE EMAIL UPDATES"}
                      </button>
                    </BusyControl>
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <p className="empty-copy">Select a company to set colors and logo, or delete it from the board list.</p>
          )
        ) : (
          <section className="ops-pdf">
            <h2 className="panel-title">CREDENTIALS PDF</h2>
            {pdfPreview ? (
              <iframe title={`Credentials for ${pdfPreview.email}`} src={pdfPreview.url} />
            ) : (
              <div className="facts">
                <p className="empty-copy">
                  Client sees only their live board. Tracker edits tracking numbers for one company.
                  Admin manages every tenant.
                </p>
                <p className="empty-copy">
                  After you invite someone, their credentials PDF opens here and beside the send
                  confirm.
                </p>
                <p className="empty-copy">
                  Directory edits stay on the row until you press SAVE. Role, company, and phone
                  write together.
                </p>
              </div>
            )}
          </section>
        )}
      </aside>
      </OpsChrome>
    </>
  );
}
