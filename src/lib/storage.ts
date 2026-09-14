import "server-only";
import { firebaseWebConfig } from "./firebase-config";

export async function uploadCompanyLogo(
  companyId: string,
  file: { bytes: Uint8Array; contentType: string; ext: string },
  token: string,
) {
  const bucket = firebaseWebConfig.storageBucket;
  if (!bucket) throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is missing.");
  const objectPath = `companies/${companyId}/logo.${file.ext}`;
  const encoded = encodeURIComponent(objectPath);
  const res = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encoded}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": file.contentType,
      },
      body: Buffer.from(file.bytes),
    },
  );
  const json = (await res.json()) as {
    downloadTokens?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message ?? "Logo upload failed.");
  }
  const tokenParam = json.downloadTokens
    ? `&token=${encodeURIComponent(json.downloadTokens)}`
    : "";
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media${tokenParam}`;
}
