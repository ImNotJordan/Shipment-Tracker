"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Building2, Eye, Plus, Search, Users } from "lucide-react";
import { OpsChrome } from "./OpsChrome";
import { CreateCompanyDialog, type NewCompany } from "./CreateCompanyDialog";
import {
  FALLBACK,
  groundSwatch,
  paletteFromFile,
  paletteFromUrl,
  type BoardGround,
  type Palette,
} from "@/lib/logo-palette";
import { GateMark } from "./GateMark";
import { ActionProgress, BusyControl } from "./ActionProgress";
import { ConfirmProvider, openViewAsTab, useConfirm } from "./ConfirmDialog";
import { pulsePanel, staggerRows } from "@/lib/ops-motion";
import { parseEmailList } from "@/lib/emails";
import {
  normalizePhone,
  parsePhoneList,
  phoneListProblem,
  phoneProblem,
  typedPhone,
} from "@/lib/phones";
import { ChipInput } from "./ChipInput";
import { OpsToast, useOpsToast } from "./OpsToast";
import { SEED_SLUG, type CompanyRecord, type Role, type SessionUser, type UserRecord } from "@/lib/types";

type NotifyDraft = { enabled: boolean; cc: string; ccPhones: string };

function notifyDraftFrom(company: CompanyRecord): NotifyDraft {
  return {
    enabled: company.notifyEnabled !== false,
    cc: (company.notifyCc ?? []).join("\n"),
    ccPhones: (company.notifyCcPhones ?? []).join("\n"),
  };
}

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

const rowClass = (revoked: boolean, open: boolean) =>
  [revoked ? "is-revoked" : "", open ? "is-editing" : ""].filter(Boolean).join(" ") || undefined;

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

type Tab = "companies" | "users" | "previews";

const TABS = [
  ["companies", "COMPANIES", Building2],
  ["users", "USERS", Users],
  ["previews", "PREVIEWS", Eye],
] as const;

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
  const [tab, setTab] = useState<Tab>("companies");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<{
    kind: "tracker" | "client";
    companyId?: string;
  } | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [companies, setCompanies] = useState(initialCompanies);
  const [users, setUsers] = useState(initialUsers);
  const [selectedId, setSelectedId] = useState<string | null>(initialCompanies[0]?.id ?? null);
  const [invite, setInvite] = useState({
    email: "",
    name: "",
    role: "client" as Role,
    companyId: initialCompanies[0]?.id ?? "",
    cc: "",
    phone: "",
  });
  // Only companies with an unsaved edit appear here. Anything absent reads
  // straight from the server, so the pickers cannot show a colour the board
  // does not actually have.
  const [branding, setBranding] = useState<
    Record<string, { accent: string; background: string; ground: BoardGround | null }>
  >({});
  // Suggestions are read from the selected board's own logo, not from whatever
  // colours it happens to be wearing at the moment.
  const [logoPalette, setLogoPalette] = useState<Palette>(FALLBACK);
  const [notify, setNotify] = useState<Record<string, NotifyDraft>>(
    Object.fromEntries(initialCompanies.map((company) => [company.id, notifyDraftFrom(company)])),
  );
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [smsFrom, setSmsFrom] = useState("");
  const [notifyPhoneError, setNotifyPhoneError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, UserEdit>>({});
  // A directory is read far more often than it is edited, so a row shows what
  // it IS and opens its controls only when asked. One row at a time: two open
  // rows of selects is the wall of inputs this replaced.
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [busy, setBusy] = useState<{
    key: "create" | "notify" | "invite" | "save" | "sms" | "delete" | "delete-company" | "brand";
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
    setSmsFrom(typeof companyJson.smsFrom === "string" ? companyJson.smsFrom : "");
    setNotifyPhoneError(null);
    setNotify(
      Object.fromEntries(
        (companyJson.companies ?? []).map((company: CompanyRecord) => [
          company.id,
          notifyDraftFrom(company),
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

  function discardBrand(company: CompanyRecord) {
    setBranding((current) => {
      const next = { ...current };
      delete next[company.id];
      return next;
    });
  }

  function setBrand(
    company: CompanyRecord,
    patch: Partial<{ accent: string; background: string; ground: BoardGround | null }>,
  ) {
    setBranding((current) => ({
      ...current,
      [company.id]: {
        accent: current[company.id]?.accent ?? company.accent,
        background: current[company.id]?.background ?? company.background,
        ground: current[company.id]?.ground ?? company.ground,
        ...patch,
      },
    }));
  }

  async function onSuggestColors(company: CompanyRecord) {
    const palette = company.logoUrl ? await paletteFromUrl(company.logoUrl) : FALLBACK;
    setLogoPalette(palette);
    // The logo's own layout comes WITH the logo. What is suggested is the flat
    // colour it washes over, which is the only part left to choose.
    setBranding((current) => ({
      ...current,
      [company.id]: {
        accent: palette.accents[0],
        background: palette.backgrounds[0] ?? company.background,
        ground: palette.ground,
      },
    }));
    toast.show(
      "ok",
      !company.logoUrl
        ? "No logo on this board, so the system mark is suggested. SAVE COLORS to keep it."
        : palette.ground
          ? "Logo applied to the board, over a matching colour. SAVE COLORS to keep it."
          : "Colours read from the logo. SAVE COLORS to keep them.",
    );
  }

  function selectCompany(id: string) {
    setSelectedId(id);
    pulsePanel(detailRef.current);
  }

  function switchTab(next: Tab) {
    setTab(next);
    setEditingUser(null);
    setQuery("");
    closePreview();
    pulsePanel(detailRef.current);
  }

  function openPreview(kind: "tracker" | "client") {
    if (kind === "client" && !selected) return;
    setPreviewReady(false);
    // The tracker preview follows the board selected in the console, instead
    // of whatever the server would otherwise default to.
    setPreview({ kind, companyId: selected?.id });
  }

  function previewCompanyId(id: string) {
    setPreviewReady(false);
    setPreview({ kind: "client", companyId: id });
  }

  function closePreview() {
    setPreview(null);
    setPreviewReady(false);
  }

  async function onCreate(draft: NewCompany) {
    // The dialog closes before the work starts: a modal owns the browser's top
    // layer, so the console's loading screen could never cover it.
    setCreating(false);
    setBusy({ key: "create", label: "CREATING COMPANY" });
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: draft.name }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.show("bad", json.error ?? "Could not create company.");
        return;
      }
      // The board exists either way; colours and logo are follow-ups that can
      // fail on their own without losing the tenant.
      await fetch(`/api/companies/${json.company.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accent: draft.accent,
          background: draft.background,
          ground: draft.ground,
        }),
      });
      if (draft.logo) {
        const data = new FormData();
        data.set("logo", draft.logo);
        const logoRes = await fetch(`/api/companies/${json.company.id}/logo`, {
          method: "POST",
          body: data,
        });
        if (!logoRes.ok) {
          const logoJson = await logoRes.json().catch(() => null);
          toast.show("bad", logoJson?.error ?? "Board created, but the logo did not upload.");
        }
      }
      toast.show("ok", `${json.company.name} is ready at /track/${json.company.slug}`);
      setSelectedId(json.company.id);
      await load();
      pulsePanel(detailRef.current);
    } finally {
      setBusy(null);
    }
  }

  async function onRemoveLogo(companyId: string) {
    const okRemove = await confirm({
      title: "REMOVE LOGO",
      body: "Clear this board's logo? The board falls back to its wordmark.",
      confirmLabel: "REMOVE",
      danger: true,
    });
    if (!okRemove) return;
    const res = await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ logoUrl: null }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.show("bad", json.error ?? "Could not remove logo.");
      return;
    }
    toast.show("ok", "Logo removed.");
    await load();
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
    setBusy({ key: "delete-company", id, label: "DELETING COMPANY" });
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
    const settings = notify[company.id] ?? notifyDraftFrom(company);
    const phoneError = phoneListProblem(settings.ccPhones);
    if (phoneError) {
      setNotifyPhoneError(phoneError);
      toast.show("bad", phoneError);
      document.getElementById("notify-cc-phones")?.focus();
      return;
    }
    const ccPhones = parsePhoneList(settings.ccPhones).phones;
    const okSave = await confirm({
      title: "SAVE UPDATES",
      body: settings.enabled
        ? `Send FedEx tracking updates for ${company.name} to client accounts, CC emails, and CC phones saved here?`
        : `Stop sending FedEx tracking updates for ${company.name}?`,
      confirmLabel: "SAVE",
    });
    if (!okSave) return;
    setBusy({ key: "notify", label: "SAVING UPDATES" });
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notifyEnabled: settings.enabled,
          notifyCc: parseEmailList(settings.cc),
          notifyCcPhones: ccPhones,
        }),
      });
      const json = await res.json();
      if (!res.ok) toast.show("bad", json.error ?? "Could not save updates.");
      else toast.show("ok", `Saved client update emails and SMS for ${company.name}.`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function onSendTestSms(company: CompanyRecord) {
    const phones = [
      ...new Set([
        ...users
          .filter(
            (row) =>
              row.role === "client" &&
              row.companyId === company.id &&
              !row.disabled &&
              row.phone,
          )
          .map((row) => row.phone as string),
        ...(company.notifyCcPhones ?? []),
      ]),
    ].filter((phone) => phone !== smsFrom);
    const okSend = await confirm({
      title: "SEND TEST SMS",
      body: phones.length
        ? `Text ${phones.join(", ")} from ${smsFrom || "the OpenPhone number"}? The thread stays open in that OpenPhone inbox.`
        : `No numbers to text. Save a client phone or CC phone first.`,
      confirmLabel: "SEND",
    });
    if (!okSend) return;
    setBusy({ key: "sms", id: company.id, label: "SENDING SMS" });
    try {
      const res = await fetch(`/api/companies/${company.id}/sms`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) toast.show("bad", json.error ?? "Could not send SMS.");
      else {
        const sent = Array.isArray(json.phones) ? json.phones.join(", ") : "saved phones";
        const skipped =
          Array.isArray(json.skipped) && json.skipped.length
            ? ` Skipped ${json.skipped.join(", ")} (OpenPhone cannot text its own number).`
            : "";
        toast.show(
          "ok",
          `SMS sent from ${json.from || smsFrom || "OpenPhone"} to ${sent}. Check the Open inbox, not Done.${skipped}`,
        );
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
      ground: company.ground,
    };
    setBusy({ key: "brand", id: company.id, label: "SAVING COLORS" });
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: company.name,
          accent: colors.accent,
          background: colors.background,
          ground: colors.ground,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.show("bad", json.error ?? "Could not save board colors.");
      } else {
        // The server now holds these, so the override has nothing left to say.
        discardBrand(company);
        toast.show("ok", `Updated ${company.name} board colors.`);
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function onLogo(company: CompanyRecord, file: File | undefined) {
    if (!file) return;
    // The pick is shown before anything is sent, so a wrong file is caught by
    // eye here rather than on the live board afterwards — and with it the
    // colours it would hand the board, so the artwork and its palette are one
    // decision instead of an upload followed by a hunt for SUGGEST COLORS.
    const preview = URL.createObjectURL(file);
    try {
      const palette = await paletteFromFile(file);
      const okLogo = await confirm({
        title: "UPDATE LOGO",
        body: `Replace ${company.name}'s board logo with ${file.name}? Its colours are applied to the board with it.`,
        confirmLabel: "UPLOAD",
        previewSrc: preview,
        previewLabel: "NEW LOGO",
        previewKind: "image",
        previewGround: palette.ground ? groundSwatch(palette.ground) : undefined,
        previewAccents: palette.accents,
      });
      if (!okLogo) return;
      setBusy({ key: "brand", id: company.id, label: "UPLOADING LOGO" });
      const data = new FormData();
      data.set("logo", file);
      const res = await fetch(`/api/companies/${company.id}/logo`, { method: "POST", body: data });
      const json = await res.json();
      if (!res.ok) {
        toast.show("bad", json.error ?? "Could not upload logo.");
        return;
      }
      const painted = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: company.name,
          accent: palette.accents[0],
          background: palette.backgrounds[0] ?? company.background,
          ground: palette.ground,
        }),
      });
      // The logo is live either way, so a failed recolour is reported rather
      // than pretended away.
      toast.show(
        painted.ok ? "ok" : "bad",
        painted.ok
          ? "Logo updated, and the board recoloured from it."
          : "Logo updated, but its colours could not be saved.",
      );
      setLogoPalette(palette);
      // The server now holds these, so a stale override must not mask them.
      discardBrand(company);
      await load();
    } finally {
      setBusy(null);
      URL.revokeObjectURL(preview);
    }
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
        setEditingUser(null);
        toast.show("ok", `Saved ${row.email}.`);
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  const previewCompany = preview?.companyId
    ? (companies.find((item) => item.id === preview.companyId) ?? null)
    : null;
  // The previewed page, without ?embed — what a new tab should open.
  const previewHref = !preview
    ? null
    : preview.kind === "tracker"
      ? previewCompany
        ? `/tracker?companyId=${previewCompany.id}`
        : "/tracker"
      : previewCompany
        ? `/track/${previewCompany.slug}`
        : null;
  const previewLabel =
    preview?.kind === "client"
      ? `CLIENT — ${previewCompany?.name.toUpperCase() ?? "—"}`
      : `TRACKER — ${previewCompany?.name.toUpperCase() ?? "—"}`;

  const needle = query.trim().toLowerCase();
  // The seed board is the one that cannot be deleted and the one a new install
  // starts from, so it reads first. Array.sort is stable, so the rest keep the
  // name order the server already put them in.
  const shownCompanies = (needle
    ? companies.filter((company) =>
        `${company.name} ${company.slug}`.toLowerCase().includes(needle),
      )
    : companies
  )
    .slice()
    .sort((a, b) => Number(b.slug === SEED_SLUG) - Number(a.slug === SEED_SLUG));
  // Whoever is signed in reads their own account first, so the row whose
  // controls are all disabled is never hunted for. Array.sort is stable, so
  // everyone else keeps the email order the server already put them in.
  const shownUsers = (needle
    ? users.filter((row) =>
        `${row.name ?? ""} ${row.email} ${row.role}`.toLowerCase().includes(needle),
      )
    : users
  )
    .slice()
    .sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id));
  const selected = companies.find((item) => item.id === selectedId) ?? null;
  const colors = selected
    ? (branding[selected.id] ?? {
        accent: selected.accent,
        background: selected.background,
        ground: selected.ground,
      })
    : null;
  const brandDirty = Boolean(
    selected &&
      branding[selected.id] &&
      (branding[selected.id].accent !== selected.accent ||
        branding[selected.id].background !== selected.background ||
        JSON.stringify(branding[selected.id].ground) !== JSON.stringify(selected.ground)),
  );

  // The selected board's own logo decides what the pickers offer. The read is
  // async and a fast click can supersede it, so a stale answer is dropped
  // rather than shown against the wrong board.
  useEffect(() => {
    const url = selected?.logoUrl ?? null;
    if (!url) {
      setLogoPalette(FALLBACK);
      return;
    }
    let alive = true;
    void paletteFromUrl(url).then((next) => {
      if (alive) setLogoPalette(next);
    });
    return () => {
      alive = false;
    };
  }, [selected?.logoUrl]);
  const mail = selected ? (notify[selected.id] ?? notifyDraftFrom(selected)) : null;
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
  const savedSmsPhones = [
    ...new Set([...(clientPhones), ...(selected?.notifyCcPhones ?? [])]),
  ].filter((phone) => phone !== smsFrom);
  const ccIncludesFrom =
    Boolean(smsFrom) && parsePhoneList(mail?.ccPhones).phones.includes(smsFrom);

  return (
    <>
      <OpsToast toast={toast.toast} onDismiss={toast.dismiss} />
      <OpsChrome
        user={user}
        station="ADMIN"
        clientSlug={selected?.slug}
        brand={colors}
        nav={TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "is-on" : undefined}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => switchTab(key)}
          >
            <Icon size={12} aria-hidden />
            {label}
          </button>
        ))}
        bar={
          tab === "previews" ? null : (
            <label className="ops-search">
              <Search size={12} aria-hidden />
              <span className="sr-only">
                {tab === "companies" ? "Search companies" : "Search users"}
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tab === "companies" ? "Search company" : "Search users"}
              />
            </label>
          )
        }
      >
      {tab === "previews" ? (
        <section className="ops-previews">
          <div className="ops-preview-head">
            {preview && previewHref ? (
              <>
                <span className="ops-meta">PREVIEWING {previewLabel}</span>
                {preview.kind === "client" ? (
                  <label className="ops-preview-company">
                    <span className="sr-only">Company to preview</span>
                    <select
                      value={previewCompany?.id ?? ""}
                      onChange={(event) => previewCompanyId(event.target.value)}
                    >
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  type="button"
                  className="ops-key"
                  onClick={() =>
                    void (async () => {
                      const okTab = await confirm({
                        title: "OPEN IN NEW TAB",
                        body: `Open ${previewHref} in its own tab, with its full navigation? The preview here stays open.`,
                        confirmLabel: "OPEN TAB",
                      });
                      if (okTab) openViewAsTab(previewHref);
                    })()
                  }
                >
                  OPEN IN NEW TAB
                </button>
                <button type="button" className="ops-key" onClick={closePreview}>
                  CLOSE PREVIEW
                </button>
              </>
            ) : (
              <div className="ops-preview-picks">
                <button
                  type="button"
                  className="ops-key"
                  onClick={() => openPreview("tracker")}
                >
                  TRACKER
                </button>
                <button
                  type="button"
                  className="ops-key"
                  disabled={!selected}
                  onClick={() => openPreview("client")}
                >
                  CLIENT
                </button>
              </div>
            )}
          </div>
          <div className="ops-preview-stage">
            {/* The mark holds the empty space, then folds away as the sign-in
                loader takes the same spot — one gesture, not two overlays. */}
            <div
              className="ops-preview-mark"
              data-state={!preview ? "idle" : previewReady ? "done" : "loading"}
            >
              <div className="gate-mark-well">
                <GateMark />
              </div>
              <p className="empty-copy">
                {selected
                  ? `Pick a console. Client opens ${selected.name}.`
                  : "Pick a console. Select a company on Companies to preview its client board."}
              </p>
            </div>
            <ActionProgress
              overlay
              inset
              active={Boolean(preview) && !previewReady}
              label={`OPENING ${previewLabel}`}
            />
            {preview && previewHref ? (
              <iframe
                key={previewHref}
                src={`${previewHref}${previewHref.includes("?") ? "&" : "?"}embed=1`}
                title={`Preview of ${previewLabel}`}
                data-ready={previewReady}
                onLoad={() => setPreviewReady(true)}
              />
            ) : null}
          </div>
        </section>
      ) : (
        <>
      <section className="ops-stage">
        <div className="shipments-head">
          {tab === "companies" ? <Building2 size={12} aria-hidden /> : <Users size={12} aria-hidden />}
          <span>{tab === "companies" ? "BOARDS" : "DIRECTORY"}</span>
          <b>{tab === "companies" ? shownCompanies.length : shownUsers.length}</b>
          {tab === "companies" ? (
            <button type="button" className="ops-add" onClick={() => setCreating(true)}>
              Add company
              <Plus size={12} aria-hidden />
            </button>
          ) : null}
        </div>
        {tab === "companies" ? (
          <ul ref={listRef} className="console-scroll ops-rows">
            {shownCompanies.length === 0 ? (
              <li className="empty-row">
                {needle ? `No board matches “${query.trim()}”.` : "No companies yet. Add one above."}
              </li>
            ) : (
              shownCompanies.map((company) => {
                const active = company.id === selected?.id;
                const deleting = busy?.key === "delete-company" && busy.id === company.id;
                return (
                  <li key={company.id}>
                    <button
                      type="button"
                      className={`ops-row ${active ? "is-active" : ""}`}
                      onClick={() => selectCompany(company.id)}
                    >
                      <span className="ship-num">{company.name}</span>
                      <span className="ship-lane">/track/{company.slug}</span>
                      {company.logoUrl ? null : <span className="ship-status">NO LOGO</span>}
                    </button>
                    {/* Sits outside the button so it centres on the whole card
                        rather than the name strip alone. */}
                    {company.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={company.logoUrl} alt="" className="ops-row-logo" />
                    ) : null}
                    <div className="ops-row-tools">
                      {company.slug === SEED_SLUG ? (
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
          <div className="user-table">
          <div className="user-head" aria-hidden>
            <span>User</span>
            <span>Role</span>
            <span>Boards</span>
          </div>
          <ul ref={listRef} className="console-scroll ops-rows">
            {shownUsers.length === 0 ? (
              <li className="empty-row">
                {needle ? `No user matches “${query.trim()}”.` : "No users yet. Invite one on the right."}
              </li>
            ) : (
              shownUsers.map((row) => {
                const open = editingUser === row.id;
                const scope =
                  row.role === "admin"
                    ? "All companies"
                    : companies.find((item) => item.id === row.companyId)?.name ?? "No company";
                const edit = draftFor(row, edits);
                const dirty = draftDirty(row, edit);
                const locked = row.id === user.id || Boolean(busy);
                return (
                <li
                  key={row.id}
                  className={rowClass(row.disabled, open)}
                >
                  {/* The row IS the control: reading an account and opening it
                      are the same gesture, so nothing has to be aimed at. */}
                  <button
                    type="button"
                    className="user-row"
                    aria-expanded={open}
                    onClick={() => setEditingUser(open ? null : row.id)}
                  >
                    <span className="user-id">
                      <b>{row.name || row.email}</b>
                      <span>
                        {row.email}
                        {row.phone ? ` · ${row.phone}` : ""}
                      </span>
                    </span>
                    <span className={`role-pill is-${row.role}`}>
                      {row.disabled ? "revoked" : row.role}
                    </span>
                    <span className="user-scope">{scope}</span>
                  </button>
                  {open ? (
                    <div className="user-card">
                      <dl className="user-facts">
                        <div>
                          <dt>NAME</dt>
                          <dd>{row.name || "—"}</dd>
                        </div>
                        <div>
                          <dt>EMAIL</dt>
                          <dd>{row.email}</dd>
                        </div>
                        <div>
                          <dt>ADDED</dt>
                          <dd>{row.createdAt ? row.createdAt.slice(0, 10) : "—"}</dd>
                        </div>
                        <div>
                          <dt>STATUS</dt>
                          <dd>{row.disabled ? "Revoked" : "Active"}</dd>
                        </div>
                      </dl>
                      <div className="user-fields">
                        <label>
                          ROLE
                          <select
                            value={edit.role}
                            disabled={locked}
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
                        </label>
                        {edit.role === "client" ? (
                          <label>
                            PHONE
                            <input
                              type="tel"
                              inputMode="tel"
                              value={edit.phone}
                              placeholder="+63917xxxxxxx"
                              disabled={locked}
                              onChange={(event) =>
                                patchEdit(row.id, { phone: typedPhone(event.target.value) })
                              }
                            />
                          </label>
                        ) : null}
                        <label>
                          COMPANY
                          {edit.role === "admin" ? (
                            <span className="user-static">All companies</span>
                          ) : (
                            <select
                              value={edit.companyId}
                              disabled={locked}
                              onChange={(event) =>
                                patchEdit(row.id, { companyId: event.target.value })
                              }
                            >
                              {companies.map((company) => (
                                <option key={company.id} value={company.id}>
                                  {company.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </label>
                      </div>
                      <div className="user-card-acts">
                        {row.id === user.id ? (
                          <span className="ops-meta">
                            This is the account you are signed in with.
                          </span>
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
                                className="link-danger"
                                type="button"
                                disabled={Boolean(busy)}
                                onClick={() => onRevoke(row.id)}
                              >
                                Revoke access
                              </button>
                            )}
                            <button
                              className="link-danger"
                              type="button"
                              disabled={Boolean(busy)}
                              onClick={() => onDeleteUser(row.id)}
                            >
                              {busy?.key === "delete" && busy.id === row.id
                                ? busy.label
                                : "Delete"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : null}
                </li>
                );
              })
            )}
          </ul>
          </div>
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
                {selected.slug === SEED_SLUG ? (
                  <p className="ops-meta">Ronin is the seed board and cannot be deleted.</p>
                ) : (
                  <>
                    <p className="ops-meta">
                      Deletes this tenant, its shipments, and its audit log. Assigned users are revoked.
                    </p>
                    <BusyControl
                      active={busy?.key === "delete-company" && busy.id === selected.id}
                      label={busy?.key === "delete-company" ? busy.label : "Deleting company"}
                    >
                      <button
                        className="danger"
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => onDeleteCompany(selected.id)}
                      >
                        {busy?.key === "delete-company" && busy.id === selected.id
                          ? busy.label
                          : "Delete company"}
                      </button>
                    </BusyControl>
                  </>
                )}
              </div>
              <div className="ops-brand">
                <div className="ops-pick">
                  <label>
                    ACCENT
                    <input
                      type="color"
                      value={colors.accent}
                      onChange={(event) => setBrand(selected, { accent: event.target.value })}
                    />
                  </label>
                  {/* Always the logo's own inks, dominant first. A board with no artwork of
                      its own is read from the system mark instead, so it is the
                      same rule rather than a different one. */}
                  <div
                    className="ops-suggest"
                    role="group"
                    aria-label="Accents from the logo"
                  >
                    {logoPalette.accents.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        className={hex === colors.accent ? "is-on" : undefined}
                        style={{ background: hex }}
                        title={hex.toUpperCase()}
                        aria-label={`Use accent ${hex.toUpperCase()}`}
                        onClick={() => setBrand(selected, { accent: hex })}
                      />
                    ))}
                  </div>
                </div>
                <div className="ops-pick">
                  <label>
                    BACKGROUND
                    <input
                      type="color"
                      value={colors.background}
                      onChange={(event) =>
                        setBrand(selected, {
                          background: event.target.value,
                          ground: null,
                        })
                      }
                    />
                  </label>
                  {/* The board already wears its logo; these decide what that
                      wash sits ON — night colours in the logo's own hue, from
                      the system mark when the board has no logo of its own.
                      Neither touches the ground. */}
                  <div className="ops-suggest" role="group" aria-label="Backgrounds from the logo">
                    {logoPalette.backgrounds.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        className={hex === colors.background ? "is-on" : undefined}
                        style={{ background: hex }}
                        title={hex.toUpperCase()}
                        aria-label={`Use background ${hex.toUpperCase()}`}
                        onClick={() => setBrand(selected, { background: hex })}
                      />
                    ))}
                  </div>
                </div>
                <div className="ops-brand-actions">
                  <button
                    className="ops-key"
                    type="button"
                    onClick={() => void onSuggestColors(selected)}
                  >
                    SUGGESTED
                  </button>
                  <button className="ops-key" type="button" onClick={() => onSaveBrand(selected)}>
                    SAVE COLORS
                  </button>
                  {brandDirty ? (
                    <>
                      <span className="ops-dirty">UNSAVED</span>
                      <button
                        className="danger"
                        type="button"
                        onClick={() => discardBrand(selected)}
                      >
                        Discard
                      </button>
                    </>
                  ) : null}
                </div>
                <label className="ops-file">
                  LOGO
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(event) => {
                      void onLogo(selected, event.target.files?.[0]);
                      // Cleared so cancelling the preview and picking the same
                      // file again still counts as a change.
                      event.target.value = "";
                    }}
                  />
                </label>
                {selected.logoUrl ? (
                  <div className="ops-logo-row">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selected.logoUrl} alt="" className="ops-logo" />
                    <button
                      className="danger"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => onRemoveLogo(selected.id)}
                    >
                      Remove logo
                    </button>
                  </div>
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
                              ? `The same scan is also texted from ${smsFrom || "OpenPhone"} to every saved client phone and CC phone. Those threads stay open in the OpenPhone inbox.`
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
                      SMS CLIENTS: {clientPhones.length ? clientPhones.join(", ") : "no client phones yet"}
                    </p>
                    <p className="ops-meta">
                      SMS CC: {(selected.notifyCcPhones ?? []).join(", ") || "no CC phones saved yet"}
                    </p>
                    {smsConfigured ? (
                      <BusyControl
                        active={busy?.key === "sms" && busy.id === selected.id}
                        label={busy?.key === "sms" ? busy.label : "Sending SMS"}
                      >
                        <button
                          className="ops-key"
                          type="button"
                          disabled={Boolean(busy) || !savedSmsPhones.length}
                          onClick={() => onSendTestSms(selected)}
                        >
                          {busy?.key === "sms" && busy.id === selected.id
                            ? busy.label
                            : "SEND TEST SMS"}
                        </button>
                      </BusyControl>
                    ) : null}
                    <p className="ops-field-label" id="notify-cc-emails-label">
                      CC EMAILS
                    </p>
                    <ChipInput
                      id="notify-cc-emails"
                      kind="email"
                      value={mail.cc}
                      disabled={busy?.key === "notify"}
                      describedBy="notify-cc-emails-label"
                      placeholder="ops@company.com"
                      onChange={(next) =>
                        setNotify((current) => ({
                          ...current,
                          [selected.id]: { ...mail, cc: next },
                        }))
                      }
                    />
                    <p className="ops-field-label" id="notify-cc-phones-label">
                      CC PHONES
                    </p>
                    <ChipInput
                      id="notify-cc-phones"
                      kind="phone"
                      value={mail.ccPhones}
                      disabled={busy?.key === "notify"}
                      describedBy="notify-cc-phones-label notify-cc-phones-hint"
                      placeholder="+12095551212"
                      onChange={(next) => {
                        setNotifyPhoneError(null);
                        setNotify((current) => ({
                          ...current,
                          [selected.id]: { ...mail, ccPhones: next },
                        }));
                      }}
                    />
                    <p id="notify-cc-phones-hint" className="ops-meta">
                      Press Enter after each number. Client phones still get the text; these are extra copies for ops.
                    </p>
                    {ccIncludesFrom ? (
                      <p className="ops-meta">
                        {smsFrom} is the OpenPhone sending number, so it cannot receive a copy of its own texts. Use a different admin phone here.
                      </p>
                    ) : null}
                    {notifyPhoneError ? (
                      <p id="notify-cc-phones-error" className="tone-bad" role="alert">
                        {notifyPhoneError}
                      </p>
                    ) : null}
                    <BusyControl
                      active={busy?.key === "notify"}
                      label={busy?.key === "notify" ? busy.label : "Saving updates"}
                    >
                      <button
                        className="ops-key"
                        type="button"
                        disabled={busy?.key === "notify"}
                        onClick={() => onSaveNotify(selected)}
                      >
                        {busy?.key === "notify" ? busy.label : "SAVE UPDATES"}
                      </button>
                    </BusyControl>
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <p className="empty-copy">Select a company to set colors and logo, or delete it from the board list.</p>
          )
          ) : tab === "users" ? (
          <>
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
                  onChange={(event) => setInvite({ ...invite, phone: typedPhone(event.target.value) })}
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
            <p className="ops-field-label" id="invite-cc-label">
              CC EMAILS
            </p>
            <ChipInput
              id="invite-cc"
              kind="email"
              value={invite.cc}
              disabled={busy?.key === "invite"}
              describedBy="invite-cc-label"
              placeholder="ops@company.com"
              onChange={(next) => setInvite({ ...invite, cc: next })}
            />
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
            {pdfPreview ? (
              <section className="ops-pdf">
                <h2 className="panel-title">CREDENTIALS PDF</h2>
                <iframe title={`Credentials for ${pdfPreview.email}`} src={pdfPreview.url} />
              </section>
            ) : null}
          </>
        ) : null}
      </aside>
        </>
      )}
      </OpsChrome>
      <CreateCompanyDialog
        open={creating}
        busy={busy?.key === "create"}
        busyLabel={busy?.key === "create" ? busy.label : "CREATING COMPANY"}
        onClose={() => setCreating(false)}
        onSubmit={(draft) => void onCreate(draft)}
      />
      {/* One loader for the whole console, the same one the sign-in gate uses.
          Adding, removing or recolouring a board reloads the list behind it,
          so it owns the screen until the work settles. */}
      <ActionProgress
        overlay
        active={
          busy?.key === "create" ||
          busy?.key === "delete-company" ||
          busy?.key === "brand"
        }
        label={busy?.label ?? ""}
      />
    </>
  );
}
