import "server-only";
import { normalizePhone, parsePhoneList } from "./phones";
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

export function openPhoneFrom() {
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

async function notifyAudience(
  companyId: string,
  cc: string[],
  ccPhones: string[],
  token: string,
) {
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
  const from = openPhoneFrom();
  const phones = e164List([
    ...active
      .filter(
        (user) =>
          user.phone &&
          ((user.role === "client" && user.companyId === companyId) || ccSet.has(user.email)),
      )
      .map((user) => user.phone),
    ...parsePhoneList(ccPhones).phones,
  ]);
  return {
    emails,
    phones: phones.filter((phone) => phone !== from),
    skippedSelf: phones.filter((phone) => phone === from),
  };
}

function openPhoneAuthHeaders() {
  const key = openPhoneKey();
  return [...new Set([key, key.startsWith("Bearer ") ? key : `Bearer ${key}`])];
}

function openPhoneError(json: {
  message?: string;
  title?: string;
  description?: string;
  errors?: { message?: string }[];
}, fallback: string) {
  return (
    json.message ||
    json.description ||
    json.title ||
    json.errors?.map((item) => item.message).filter(Boolean).join(" ") ||
    fallback
  );
}

type OpenPhoneLine = {
  id: string;
  number: string;
  userId?: string;
  messagingUS?: string;
};

let openPhoneLinesCache: { at: number; lines: OpenPhoneLine[] } | null = null;

async function listOpenPhoneLines() {
  if (openPhoneLinesCache && Date.now() - openPhoneLinesCache.at < 5 * 60_000) {
    return openPhoneLinesCache.lines;
  }
  let lastError = "Could not list Quo phone numbers.";
  for (const base of openPhoneBases()) {
    for (const authorization of openPhoneAuthHeaders()) {
      const res = await fetch(`${base}/v1/phone-numbers`, {
        headers: { Authorization: authorization, Accept: "application/json" },
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: Array<{
          id?: string;
          number?: string;
          users?: { id?: string }[];
          restrictions?: { messaging?: { US?: string } };
        }>;
        message?: string;
        title?: string;
        description?: string;
      };
      if (!res.ok) {
        lastError = openPhoneError(json, lastError);
        if (res.status === 401 || res.status === 403) continue;
        if (res.status === 404 || res.status >= 500) break;
        continue;
      }
      const lines = (json.data ?? [])
        .filter((row) => row.id && row.number)
        .map((row) => ({
          id: row.id as string,
          number: row.number as string,
          userId: row.users?.[0]?.id,
          messagingUS: row.restrictions?.messaging?.US,
        }));
      openPhoneLinesCache = { at: Date.now(), lines };
      return lines;
    }
  }
  throw new Error(lastError);
}

async function resolveOpenPhoneSender() {
  const wanted = (process.env.OPENPHONE_FROM || process.env.QUO_FROM || "").trim();
  const e164 = normalizePhone(wanted) ?? "";
  if (!wanted) {
    throw new Error("OPENPHONE_FROM must be a full number, like +16316584888.");
  }
  const lines = await listOpenPhoneLines();
  const line = lines.find((item) => item.id === wanted || item.number === e164);
  if (!line) {
    throw new Error(
      `OPENPHONE_FROM ${wanted} is not a Quo number on this API key. Pick a line from the Quo workspace.`,
    );
  }
  if (line.messagingUS === "restricted") {
    throw new Error(
      `${line.number} cannot send US SMS in Quo. Use a line with US messaging unrestricted, and register it for A2P 10DLC.`,
    );
  }
  return line;
}

async function waitForOpenPhoneStatus(
  base: string,
  authorization: string,
  id: string,
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const res = await fetch(`${base}/v1/messages/${id}`, {
      headers: { Authorization: authorization, Accept: "application/json" },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { status?: string };
    };
    const status = json.data?.status;
    if (status === "delivered") return "delivered";
    if (status === "undelivered" || status === "failed") return status;
  }
  return "sent";
}

async function sendOpenPhone(to: string[], content: string) {
  if (!openPhoneConfigured()) {
    throw new Error("SMS is not configured. Add OPENPHONE_API_KEY and OPENPHONE_FROM.");
  }
  const sender = await resolveOpenPhoneSender();
  const requested = e164List(to);
  const skippedSelf = requested.filter((number) => number === sender.number);
  const recipients = requested.filter((number) => number !== sender.number);
  if (!recipients.length) {
    if (skippedSelf.length) {
      throw new Error(
        `${sender.number} is the OpenPhone sending number, so it cannot receive its own texts. Add a client or CC phone that is not that number.`,
      );
    }
    throw new Error("No valid phone numbers to text.");
  }
  const errors: string[] = [];
  const sent: string[] = [];
  for (const number of recipients) {
    let lastError = `OpenPhone rejected ${number}.`;
    let delivered = false;
    hostLoop: for (const base of openPhoneBases()) {
      for (const authorization of openPhoneAuthHeaders()) {
        let res: Response;
        try {
          res = await fetch(`${base}/v1/messages`, {
            method: "POST",
            headers: {
              Authorization: authorization,
              Accept: "application/json",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              content,
              from: sender.id,
              to: [number],
              ...(sender.userId ? { userId: sender.userId } : {}),
            }),
            cache: "no-store",
          });
        } catch (error) {
          lastError = error instanceof Error ? error.message : `Could not reach ${base}.`;
          continue hostLoop;
        }
        const json = (await res.json().catch(() => ({}))) as {
          data?: { id?: string; status?: string };
          message?: string;
          title?: string;
          description?: string;
          errors?: { message?: string }[];
        };
        if (!res.ok) {
          lastError = openPhoneError(json, `OpenPhone rejected ${number} (${res.status}).`);
          if (res.status === 401 || res.status === 403) continue;
          if (res.status === 404 || res.status >= 500) continue hostLoop;
          break hostLoop;
        }
        const messageId = json.data?.id;
        const status = messageId
          ? await waitForOpenPhoneStatus(base, authorization, messageId)
          : json.data?.status ?? "sent";
        if (status === "undelivered" || status === "failed") {
          lastError = `${sender.number} could not deliver SMS to ${number}. Quo accepted it, but the carrier marked it ${status}. That line is likely missing A2P 10DLC registration. Use a registered Quo number in OPENPHONE_FROM.`;
          break hostLoop;
        }
        delivered = true;
        sent.push(number);
        break hostLoop;
      }
    }
    if (!delivered) errors.push(lastError);
  }
  if (errors.length) throw new Error(errors.join(" "));
  return { from: sender.number, sent, skippedSelf };
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
    company.notifyCcPhones,
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
          `${company.name}: ${facts.trackingNumber} · ${scanLabel}. Reply STOP to opt out.`,
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
    `${input.name || "You"} are invited to ${input.companyName} Live Board. Sign-in details were emailed. Reply STOP to opt out.`,
  );
}

export async function sendTestClientSms(companyId: string, token: string) {
  if (!openPhoneConfigured()) {
    throw new Error("SMS is not configured. Add OPENPHONE_API_KEY and OPENPHONE_FROM.");
  }
  const company = await getCompanyById(companyId, token);
  if (!company) throw new Error("Company not found.");
  const { phones, skippedSelf } = await notifyAudience(
    companyId,
    company.notifyCc,
    company.notifyCcPhones,
    token,
  );
  if (!phones.length) {
    if (skippedSelf.length) {
      throw new Error(
        `${openPhoneFrom()} is the OpenPhone sending number, so it cannot receive its own texts. Add a client or CC phone that is not that number.`,
      );
    }
    throw new Error("No client or CC phone numbers saved for this company.");
  }
  const result = await sendOpenPhone(
    phones,
    `${company.name} Live Board will text this number when FedEx status changes. Reply STOP to opt out.`,
  );
  return {
    from: result.from,
    phones: result.sent,
    skipped: skippedSelf,
  };
}
