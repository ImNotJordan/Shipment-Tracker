import "server-only";
import { normalizePhone } from "./phones";
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
  return normalizePhone(process.env.OPENPHONE_FROM || process.env.QUO_FROM || "") ?? "";
}

function e164List(values: (string | null | undefined)[]) {
  return [...new Set(values.map((value) => normalizePhone(value)).filter((value): value is string => Boolean(value)))];
}

function openPhoneBase() {
  return (process.env.OPENPHONE_API_BASE || "").replace(/\/$/, "");
}

function openPhoneBases() {
  return [...new Set([openPhoneBase(), "https://api.openphone.com", "https://api.quo.com"].filter(Boolean))];
}

export function snapshotFingerprint(snapshot?: TrackSnapshot | null) {
  if (!snapshot) return "";
  return snapshot.events.map(eventKey).join("\n");
}

function eventKey(event: { at: string; description: string; city: string | null; state: string | null }) {
  return [event.at, event.description, event.city ?? "", event.state ?? ""].join("|");
}

function parseNotifiedKeys(raw: string | null | undefined) {
  const value = raw ?? "";
  if (!value) return null;
  if (value === "ev" || value.startsWith("ev\n")) {
    return new Set(value.split("\n").slice(1).filter(Boolean));
  }
  return null;
}

function serializeNotifiedKeys(keys: string[]) {
  return ["ev", ...keys].join("\n");
}

function newScanEvents(
  snapshot: TrackSnapshot,
  previous: TrackSnapshot | null,
  lastNotified: string | null,
) {
  const already = alreadyNotifiedKeys(snapshot, previous, lastNotified);
  if (already.size === 0) {
    const latest = snapshot.events[snapshot.events.length - 1];
    return { already, fresh: latest ? [latest] : [] };
  }
  return {
    already,
    fresh: snapshot.events.filter((event) => !already.has(eventKey(event))),
  };
}

function alreadyNotifiedKeys(
  snapshot: TrackSnapshot,
  previous: TrackSnapshot | null,
  lastNotified: string | null,
) {
  const stored = parseNotifiedKeys(lastNotified);
  if (stored) return stored;
  const legacy = lastNotified ? legacyEventKey(lastNotified) : null;
  if (legacy) {
    const index = snapshot.events.findIndex((event) => eventKey(event) === legacy);
    if (index >= 0) {
      return new Set(snapshot.events.slice(0, index + 1).map(eventKey));
    }
  }
  if (previous?.events.length) return new Set(previous.events.map(eventKey));
  return new Set<string>();
}

function legacyEventKey(raw: string) {
  const parts = raw.split("|");
  if (parts.length < 7) return null;
  return parts.slice(3).join("|");
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

async function notifyAudience(companyId: string, cc: string[], token: string) {
  const users = await listUsers(token);
  const active = users.filter((user) => !user.disabled);
  const clients = active.filter(
    (user) => user.role === "client" && user.companyId === companyId,
  );
  const emails = [
    ...new Set([
      ...clients.map((user) => user.email).filter((email) => email.includes("@")),
      ...cc.map((email) => email.trim().toLowerCase()).filter(Boolean),
    ]),
  ];
  const ccSet = new Set(emails);
  const phones = e164List(
    active
      .filter(
        (user) =>
          user.phone &&
          ((user.role === "client" && user.companyId === companyId) || ccSet.has(user.email)),
      )
      .map((user) => user.phone),
  );
  return { emails, phones };
}

async function sendOpenPhone(to: string[], content: string) {
  if (!openPhoneConfigured()) {
    throw new Error("SMS is not configured. Add OPENPHONE_API_KEY and OPENPHONE_FROM.");
  }
  const from = openPhoneFrom();
  const recipients = e164List(to);
  if (!from) {
    throw new Error("OPENPHONE_FROM must be a full number, like +15028016431.");
  }
  if (!recipients.length) {
    throw new Error("No valid client phone numbers to text.");
  }
  const errors: string[] = [];
  for (const number of recipients) {
    let lastError = `OpenPhone rejected ${number}.`;
    let delivered = false;
    for (const base of openPhoneBases()) {
      const res = await fetch(`${base}/v1/messages`, {
        method: "POST",
        headers: {
          Authorization: openPhoneKey(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content,
          from,
          to: [number],
          setInboxStatus: "done",
        }),
        cache: "no-store",
      });
      if (res.ok) {
        delivered = true;
        break;
      }
      const json = (await res.json().catch(() => ({}))) as {
        message?: string;
        title?: string;
        description?: string;
      };
      lastError =
        json.message ||
        json.description ||
        json.title ||
        `OpenPhone rejected ${number} (${res.status}).`;
    }
    if (!delivered) errors.push(lastError);
  }
  if (errors.length) throw new Error(errors.join(" "));
}

function emailHtml(input: {
  company: CompanyRecord;
  shipment: ShipmentRecord;
  snapshot: TrackSnapshot;
  event?: TrackSnapshot["events"][number];
}) {
  const facts = input.snapshot.facts;
  const latest = input.event ?? input.snapshot.events[input.snapshot.events.length - 1];
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
        <tr><td style="padding:8px 0;color:#c0c1c1;">STATUS</td><td style="padding:8px 0;text-align:right;color:#e3b341;">${escapeHtml(latest?.description ?? facts.status)}</td></tr>
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

async function directoryToken(fallback: string) {
  try {
    return await bootstrapToken();
  } catch {
    return fallback;
  }
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
  const { already, fresh } = newScanEvents(
    snapshot,
    input.previous,
    input.shipment.lastNotifiedFingerprint,
  );
  if (!fresh.length) return;

  const adminToken = await directoryToken(input.token);
  const company = await getCompanyById(input.companyId, adminToken);
  if (!company?.notifyEnabled) return;

  const { emails: to, phones } = await notifyAudience(
    input.companyId,
    company.notifyCc,
    adminToken,
  );
  if (!to.length && !phones.length) return;

  const facts = snapshot.facts;
  const delivered = new Set(already);
  let sent = false;
  const wantEmail = resendConfigured() && to.length > 0;
  const wantSms = openPhoneConfigured() && phones.length > 0;
  for (const event of fresh) {
    const place = [event.city, event.state].filter(Boolean).join(", ");
    const scanLabel = [event.description, place].filter(Boolean).join(" · ") || facts.status;
    let emailOk = !wantEmail;
    let smsOk = !wantSms;
    if (wantEmail) {
      try {
        await sendResend(updatesFromAddress(), {
          to,
          subject: `${company.name} · ${facts.trackingNumber} · ${scanLabel}`,
          html: emailHtml({ company, shipment: input.shipment, snapshot, event }),
          text: [
            `${company.name} FedEx update`,
            `Tracking: ${facts.trackingNumber}`,
            `Scan: ${event.description}`,
            `When: ${formatWhen(event.at)}`,
            `Place: ${place || "—"}`,
            `Board: ${boardUrl(company.slug)}`,
          ].join("\n"),
        });
        emailOk = true;
      } catch (error) {
        console.error("Resend tracking email failed", error);
      }
    }
    if (wantSms) {
      try {
        await sendOpenPhone(
          phones,
          [`${company.name} · ${facts.trackingNumber} · ${scanLabel}`, boardUrl(company.slug)].join("\n"),
        );
        smsOk = true;
      } catch (error) {
        console.error("OpenPhone SMS failed", error);
      }
    }
    if (emailOk && smsOk) {
      sent = true;
      delivered.add(eventKey(event));
    }
  }
  if (!sent) return;
  if (already.size === 0) {
    for (const event of snapshot.events) delivered.add(eventKey(event));
  }
  const notified = snapshot.events.map(eventKey).filter((key) => delivered.has(key));
  try {
    await updateShipment(
      input.companyId,
      input.shipment.id,
      { lastNotifiedFingerprint: serializeNotifiedKeys(notified) },
      adminToken,
    );
  } catch {
    await updateShipment(
      input.companyId,
      input.shipment.id,
      { lastNotifiedFingerprint: serializeNotifiedKeys(notified) },
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

export async function sendInviteSms(input: {
  phone: string | null | undefined;
  name: string;
  companyName: string;
  signInUrl: string;
}) {
  if (!openPhoneConfigured()) return;
  const phone = normalizePhone(input.phone);
  if (!phone) return;
  await sendOpenPhone(
    [phone],
    [
      `${input.name || "You"} are invited to ${input.companyName} Live Board.`,
      `Sign in: ${input.signInUrl}`,
    ].join("\n"),
  );
}

export async function sendTestClientSms(companyId: string, token: string) {
  if (!openPhoneConfigured()) {
    throw new Error("SMS is not configured. Add OPENPHONE_API_KEY and OPENPHONE_FROM.");
  }
  const company = await getCompanyById(companyId, token);
  if (!company) throw new Error("Company not found.");
  const { phones } = await notifyAudience(companyId, company.notifyCc, token);
  if (!phones.length) {
    throw new Error("No client phone numbers saved for this company.");
  }
  await sendOpenPhone(
    phones,
    [
      `${company.name} Live Board will text this number when FedEx status changes.`,
      boardUrl(company.slug),
    ].join("\n"),
  );
  return phones;
}
