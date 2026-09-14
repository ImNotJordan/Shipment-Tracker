import "server-only";
import { parseEmailList } from "./emails";
import { bootstrapToken, getCompanyById, listUsers, updateShipment } from "./store";
import type { CompanyRecord, ShipmentRecord, TrackSnapshot } from "./types";

export function resendConfigured() {
  return Boolean(process.env.RESEND_API_KEY || process.env.NEXT_PUBLIC_RESEND_API_KEY);
}

export function openPhoneConfigured() {
  return Boolean(openPhoneKey() && openPhoneFrom());
}

function openPhoneKey() {
  return (process.env.OPENPHONE_API_KEY || process.env.QUO_API_KEY || "").trim();
}

function openPhoneFrom() {
  return (process.env.OPENPHONE_FROM || process.env.QUO_FROM || "").trim();
}

function openPhoneBase() {
  return (process.env.OPENPHONE_API_BASE || "https://api.quo.com").replace(/\/$/, "");
}

export function snapshotFingerprint(snapshot?: TrackSnapshot | null) {
  if (!snapshot) return "";
  const last = snapshot.events[snapshot.events.length - 1];
  return [
    snapshot.facts.statusCode ?? "",
    snapshot.facts.status,
    String(snapshot.events.length),
    last?.at ?? "",
    last?.description ?? "",
    last?.city ?? "",
    last?.state ?? "",
  ].join("|");
}

function resendKey() {
  return process.env.RESEND_API_KEY || process.env.NEXT_PUBLIC_RESEND_API_KEY || "";
}

function inviteFromAddress() {
  return process.env.RESEND_FROM?.trim() || "Live Board <info-shipment-tracker@rahyo.com>";
}

function updatesFromAddress() {
  return process.env.RESEND_UPDATES_FROM?.trim() || "Live Board <updates@rahyo.com>";
}

async function sendResend(from: string, payload: Record<string, unknown>) {
  if (!resendConfigured()) {
    throw new Error("Email is not configured. Add RESEND_API_KEY.");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...payload, from }),
    cache: "no-store",
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new Error(json.message || json.error || `Resend rejected the message (${res.status}).`);
  }
}

export function publicAppUrl(origin?: string) {
  const live = "https://hhi-shipiment-tracker.web.app";
  for (const raw of [origin, process.env.NEXT_PUBLIC_APP_URL, live]) {
    const value = (raw ?? "").trim().replace(/\/$/, "");
    if (!value) continue;
    if (/localhost|127\.0\.0\.1/i.test(value)) continue;
    return value;
  }
  return live;
}

function boardUrl(slug: string) {
  return `${publicAppUrl()}/track/${slug}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[ch] ?? ch;
  });
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

async function clientEmails(companyId: string, token: string) {
  const users = await listUsers(token);
  return users
    .filter(
      (user) =>
        user.role === "client" &&
        user.companyId === companyId &&
        !user.disabled &&
        user.email.includes("@"),
    )
    .map((user) => user.email);
}

async function clientPhones(companyId: string, token: string) {
  const users = await listUsers(token);
  return [
    ...new Set(
      users
        .filter(
          (user) =>
            user.role === "client" &&
            user.companyId === companyId &&
            !user.disabled &&
            user.phone,
        )
        .map((user) => user.phone as string),
    ),
  ];
}

async function sendOpenPhone(to: string[], content: string) {
  if (!openPhoneConfigured()) {
    throw new Error("SMS is not configured. Add OPENPHONE_API_KEY and OPENPHONE_FROM.");
  }
  for (let i = 0; i < to.length; i += 10) {
    const chunk = to.slice(i, i + 10);
    const res = await fetch(`${openPhoneBase()}/v1/messages`, {
      method: "POST",
      headers: {
        Authorization: openPhoneKey(),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        content,
        from: openPhoneFrom(),
        to: chunk,
        setInboxStatus: "done",
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as {
        message?: string;
        title?: string;
        description?: string;
      };
      throw new Error(
        json.message || json.description || json.title || `OpenPhone rejected the message (${res.status}).`,
      );
    }
  }
}

function emailHtml(input: {
  company: CompanyRecord;
  shipment: ShipmentRecord;
  snapshot: TrackSnapshot;
}) {
  const facts = input.snapshot.facts;
  const latest = input.snapshot.events[input.snapshot.events.length - 1];
  const place = latest
    ? [latest.city, latest.state].filter(Boolean).join(", ") || "Location pending"
    : "—";
  const url = boardUrl(input.company.slug);
  return `<!doctype html>
<html>
  <body style="margin:0;background:#10181a;color:#eff0f0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
    <div style="max-width:560px;margin:0 auto;padding:28px 24px;">
      <p style="letter-spacing:0.18em;color:#c0c1c1;font-size:11px;margin:0 0 8px;">LIVE BOARD</p>
      <h1 style="margin:0 0 20px;font-size:20px;letter-spacing:0.04em;">${escapeHtml(input.company.name.toUpperCase())}</h1>
      <p style="margin:0 0 18px;color:#c0c1c1;line-height:1.5;">FedEx posted a new tracking update for this shipment.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:8px 0;color:#c0c1c1;">TRACKING</td><td style="padding:8px 0;text-align:right;">${escapeHtml(facts.trackingNumber)}</td></tr>
        <tr><td style="padding:8px 0;color:#c0c1c1;">STATUS</td><td style="padding:8px 0;text-align:right;color:#e3b341;">${escapeHtml(facts.status)}</td></tr>
        <tr><td style="padding:8px 0;color:#c0c1c1;">LATEST SCAN</td><td style="padding:8px 0;text-align:right;">${escapeHtml(latest?.description ?? "Awaiting scan")}</td></tr>
        <tr><td style="padding:8px 0;color:#c0c1c1;">WHEN</td><td style="padding:8px 0;text-align:right;">${escapeHtml(formatWhen(latest?.at ?? input.snapshot.fetchedAt))}</td></tr>
        <tr><td style="padding:8px 0;color:#c0c1c1;">PLACE</td><td style="padding:8px 0;text-align:right;">${escapeHtml(place)}</td></tr>
        <tr><td style="padding:8px 0;color:#c0c1c1;">ORIGIN</td><td style="padding:8px 0;text-align:right;">${escapeHtml(facts.origin ?? "—")}</td></tr>
        <tr><td style="padding:8px 0;color:#c0c1c1;">DESTINATION</td><td style="padding:8px 0;text-align:right;">${escapeHtml(facts.destination ?? "—")}</td></tr>
      </table>
      <p style="margin:24px 0 0;"><a href="${escapeHtml(url)}" style="color:#e3b341;">Open live board</a></p>
    </div>
  </body>
</html>`;
}

export async function notifyTrackingUpdate(input: {
  companyId: string;
  shipment: ShipmentRecord;
  previous: TrackSnapshot | null;
  token: string;
}) {
  if (!resendConfigured() && !openPhoneConfigured()) return;
  const snapshot = input.shipment.snapshot;
  if (!snapshot) return;
  const nextPrint = snapshotFingerprint(snapshot);
  if (!nextPrint) return;
  if (nextPrint === snapshotFingerprint(input.previous)) return;
  if (nextPrint === (input.shipment.lastNotifiedFingerprint ?? "")) return;

  const company = await getCompanyById(input.companyId, input.token);
  if (!company?.notifyEnabled) return;

  const clients = await clientEmails(input.companyId, input.token);
  const phones = await clientPhones(input.companyId, input.token);
  const ccConfigured = company.notifyCc.filter((email) => !clients.includes(email));
  const to = clients.length ? clients : ccConfigured;
  const cc = clients.length ? ccConfigured : [];
  if (!to.length && !phones.length) return;

  const facts = snapshot.facts;
  const smsText = [
    `${company.name} · ${facts.trackingNumber} · ${facts.status}`,
    boardUrl(company.slug),
  ].join("\n");

  let sent = false;
  if (resendConfigured() && to.length) {
    try {
      await sendResend(updatesFromAddress(), {
        to,
        cc: cc.length ? cc : undefined,
        subject: `${company.name} · ${facts.trackingNumber} · ${facts.status}`,
        html: emailHtml({ company, shipment: input.shipment, snapshot }),
        text: [
          `${company.name} FedEx update`,
          `Tracking: ${facts.trackingNumber}`,
          `Status: ${facts.status}`,
          `Board: ${boardUrl(company.slug)}`,
        ].join("\n"),
      });
      sent = true;
    } catch {
      // SMS may still go out.
    }
  }
  if (openPhoneConfigured() && phones.length) {
    try {
      await sendOpenPhone(phones, smsText);
      sent = true;
    } catch {
      // Email may have already gone out.
    }
  }
  if (!sent) return;
  try {
    await updateShipment(
      input.companyId,
      input.shipment.id,
      { lastNotifiedFingerprint: nextPrint },
      await bootstrapToken(),
    );
  } catch {
    await updateShipment(
      input.companyId,
      input.shipment.id,
      { lastNotifiedFingerprint: nextPrint },
      input.token,
    );
  }
}

function inviteHtml(input: {
  name: string;
  email: string;
  password: string;
  role: string;
  companyName: string;
  signInUrl: string;
}) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#10181a;color:#eff0f0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
    <div style="max-width:560px;margin:0 auto;padding:28px 24px;">
      <p style="letter-spacing:0.18em;color:#c0c1c1;font-size:11px;margin:0 0 8px;">LIVE BOARD</p>
      <h1 style="margin:0 0 20px;font-size:20px;letter-spacing:0.04em;">ACCESS CREDENTIALS</h1>
      <p style="margin:0 0 18px;color:#c0c1c1;line-height:1.5;">
        ${escapeHtml(input.name || input.email)}, you have been invited to Live Board.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:8px 0;color:#c0c1c1;">EMAIL</td><td style="padding:8px 0;text-align:right;">${escapeHtml(input.email)}</td></tr>
        <tr><td style="padding:8px 0;color:#c0c1c1;">TEMPORARY PASSWORD</td><td style="padding:8px 0;text-align:right;color:#e3b341;">${escapeHtml(input.password)}</td></tr>
        <tr><td style="padding:8px 0;color:#c0c1c1;">ROLE</td><td style="padding:8px 0;text-align:right;">${escapeHtml(input.role.toUpperCase())}</td></tr>
        <tr><td style="padding:8px 0;color:#c0c1c1;">COMPANY</td><td style="padding:8px 0;text-align:right;">${escapeHtml(input.companyName)}</td></tr>
      </table>
      <p style="margin:24px 0 0;"><a href="${escapeHtml(input.signInUrl)}" style="color:#e3b341;">Sign in</a></p>
      <p style="margin:16px 0 0;color:#c0c1c1;font-size:12px;line-height:1.5;">A credentials PDF is attached. After first sign-in you must set a new password before the board opens.</p>
    </div>
  </body>
</html>`;
}

export async function sendInviteEmail(input: {
  to: string;
  cc?: string[];
  name: string;
  email: string;
  password: string;
  role: string;
  companyName: string;
  signInUrl: string;
  pdf: Uint8Array;
}) {
  const cc = (input.cc ?? []).filter((email) => email !== input.to);
  await sendResend(inviteFromAddress(), {
    to: [input.to],
    cc: cc.length ? cc : undefined,
    subject: "Live Board access",
    html: inviteHtml(input),
    text: [
      "You have been invited to Live Board.",
      `Sign in: ${input.signInUrl}`,
      `Email: ${input.email}`,
      `Temporary password: ${input.password}`,
      `Role: ${input.role}`,
      `Company: ${input.companyName}`,
      "A credentials PDF is attached. After first sign-in you must set a new password before the board opens.",
    ].join("\n"),
    attachments: [
      {
        filename: `${input.email.replace(/[^a-z0-9]+/gi, "-")}-live-board-credentials.pdf`,
        content: Buffer.from(input.pdf).toString("base64"),
      },
    ],
  });
}

export { parseEmailList };
