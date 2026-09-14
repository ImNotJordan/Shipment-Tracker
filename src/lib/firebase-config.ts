export const firebaseWebConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
};

export function firebaseProjectId() {
  const id = firebaseWebConfig.projectId;
  if (!id) throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing.");
  return id;
}

export function firebaseApiKey() {
  const key = firebaseWebConfig.apiKey;
  if (!key) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is missing.");
  return key;
}
