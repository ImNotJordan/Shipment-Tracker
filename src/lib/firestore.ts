import "server-only";
import { firebaseProjectId } from "./firebase-config";

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } };

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

type FirestoreErrorBody = {
  error?: { code?: number; message?: string; status?: string };
};

function rootUrl() {
  return `https://firestore.googleapis.com/v1/projects/${firebaseProjectId()}/databases/(default)/documents`;
}

function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { nullValue: null };
    return { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (typeof value === "object") {
    const fields: Record<string, FirestoreValue> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      fields[key] = encodeValue(nested);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function encodeDocument(data: Record<string, unknown>) {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = encodeValue(value);
  }
  return { fields };
}

function decodeValue(value: FirestoreValue): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in value) {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value.mapValue.fields ?? {})) {
      out[key] = decodeValue(nested);
    }
    return out;
  }
  return null;
}

export function decodeDocument(doc: FirestoreDocument) {
  const name = doc.name ?? "";
  const id = name.split("/").pop() ?? "";
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc.fields ?? {})) {
    data[key] = decodeValue(value);
  }
  return { id, data };
}

function headers(token?: string) {
  const out: Record<string, string> = { "content-type": "application/json" };
  if (token) out.Authorization = `Bearer ${token}`;
  return out;
}

async function parseResponse(res: Response) {
  const json = (await res.json().catch(() => ({}))) as FirestoreErrorBody &
    FirestoreDocument & { documents?: FirestoreDocument[] };
  if (!res.ok) {
    const message =
      json.error?.message ??
      `Firestore request failed (${res.status}). Create a Firestore database and deploy firestore.rules.`;
    throw new Error(message);
  }
  return json;
}

export async function listDocuments(collection: string, token?: string) {
  const documents: FirestoreDocument[] = [];
  let pageToken = "";
  do {
    const url = new URL(`${rootUrl()}/${collection}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: headers(token), cache: "no-store" });
    if (res.status === 404) return [];
    const json = (await parseResponse(res)) as {
      documents?: FirestoreDocument[];
      nextPageToken?: string;
    };
    documents.push(...(json.documents ?? []));
    pageToken = json.nextPageToken ?? "";
  } while (pageToken);
  return documents.map(decodeDocument);
}

export async function getDocument(collection: string, id: string, token?: string) {
  const res = await fetch(`${rootUrl()}/${collection}/${id}`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  const json = (await parseResponse(res)) as FirestoreDocument;
  return decodeDocument(json);
}

export async function queryByField(
  collection: string,
  field: string,
  value: string,
  token?: string,
) {
  const res = await fetch(`${rootUrl()}:runQuery`, {
    method: "POST",
    headers: headers(token),
    cache: "no-store",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: "EQUAL",
            value: { stringValue: value },
          },
        },
      },
    }),
  });
  const json = (await res.json().catch(() => [])) as
    | Array<{ document?: FirestoreDocument }>
    | FirestoreErrorBody;
  if (!res.ok || (json && !Array.isArray(json) && (json as FirestoreErrorBody).error)) {
    const all = await listDocuments(collection, token);
    return all.filter((row) => String(row.data[field] ?? "") === value);
  }
  return (json as Array<{ document?: FirestoreDocument }>)
    .filter((row) => row.document)
    .map((row) => decodeDocument(row.document as FirestoreDocument));
}

export async function putDocument(
  collection: string,
  id: string,
  data: Record<string, unknown>,
  token: string,
) {
  const res = await fetch(`${rootUrl()}/${collection}/${id}`, {
    method: "PATCH",
    headers: headers(token),
    cache: "no-store",
    body: JSON.stringify(encodeDocument(data)),
  });
  await parseResponse(res);
}

export async function patchDocument(
  collection: string,
  id: string,
  data: Record<string, unknown>,
  token: string,
) {
  const mask = Object.keys(data)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join("&");
  const res = await fetch(`${rootUrl()}/${collection}/${id}?${mask}`, {
    method: "PATCH",
    headers: headers(token),
    cache: "no-store",
    body: JSON.stringify(encodeDocument(data)),
  });
  await parseResponse(res);
}

export async function deleteDocument(collection: string, id: string, token: string) {
  const res = await fetch(`${rootUrl()}/${collection}/${id}`, {
    method: "DELETE",
    headers: headers(token),
    cache: "no-store",
  });
  if (res.status === 404) return;
  await parseResponse(res);
}
