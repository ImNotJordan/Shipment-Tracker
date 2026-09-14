import "server-only";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { firebaseProjectId } from "./firebase-config";

let cached: { token: string; expiresAt: number } | null = null;

function remember(token: string, expiresInSec: number) {
  cached = {
    token,
    expiresAt: Date.now() + Math.max(30, expiresInSec - 120) * 1000,
  };
  return token;
}

function onGcp() {
  return Boolean(
    process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.FIREBASE_CONFIG,
  );
}

function gcloudConfigDir() {
  if (process.env.CLOUDSDK_CONFIG) return process.env.CLOUDSDK_CONFIG;
  if (process.platform === "win32") return join(process.env.APPDATA || homedir(), "gcloud");
  return join(homedir(), ".config", "gcloud");
}

async function metadataAccessToken() {
  const res = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    {
      headers: { "Metadata-Flavor": "Google" },
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  return remember(json.access_token, json.expires_in ?? 3600);
}

async function refreshAuthorizedUser(creds: {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!json.access_token) {
    throw new Error(json.error_description || json.error || "Google token refresh failed.");
  }
  return remember(json.access_token, json.expires_in ?? 3600);
}

async function gcloudUserAccessToken() {
  const legacyDir = join(gcloudConfigDir(), "legacy_credentials");
  const accounts = await readdir(legacyDir, { withFileTypes: true });
  for (const account of accounts) {
    if (!account.isDirectory()) continue;
    try {
      const raw = await readFile(join(legacyDir, account.name, "adc.json"), "utf8");
      const creds = JSON.parse(raw) as {
        type?: string;
        client_id?: string;
        client_secret?: string;
        refresh_token?: string;
      };
      if (
        creds.type === "authorized_user" &&
        creds.client_id &&
        creds.client_secret &&
        creds.refresh_token
      ) {
        return await refreshAuthorizedUser({
          client_id: creds.client_id,
          client_secret: creds.client_secret,
          refresh_token: creds.refresh_token,
        });
      }
    } catch {
      // Try the next gcloud login.
    }
  }
  return null;
}

async function googleAccessToken() {
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  if (onGcp()) {
    const meta = await metadataAccessToken();
    if (meta) return meta;
  }
  const user = await gcloudUserAccessToken();
  if (user) return user;
  throw new Error(
    "Could not delete the Firebase Authentication account. Sign in with gcloud (gcloud auth login).",
  );
}

export async function deleteAuthUser(uid: string) {
  const projectId = firebaseProjectId();
  const accessToken = await googleAccessToken();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:delete`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "x-goog-user-project": projectId,
      },
      body: JSON.stringify({ localId: uid }),
      cache: "no-store",
    },
  );
  if (res.ok || res.status === 404) return;
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string };
  };
  const message = json.error?.message ?? "";
  if (message.includes("USER_NOT_FOUND") || json.error?.status === "NOT_FOUND") return;
  throw new Error(
    message
      ? `Could not delete the Firebase Authentication account. ${message}`
      : "Could not delete the Firebase Authentication account.",
  );
}
