const E164 = /^\+[1-9]\d{7,14}$/;

export function normalizePhone(raw: string | null | undefined) {
  const value = (raw ?? "").trim();
  if (!value) return null;
  let digits = value.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  const bare = digits.replace(/\D/g, "");
  if (/^09\d{9}$/.test(bare)) return `+63${bare.slice(1)}`;
  if (/^63\d{10}$/.test(bare)) return `+${bare}`;
  if (/^1\d{10}$/.test(bare)) return `+${bare}`;
  if (/^\d{10}$/.test(bare)) return `+1${bare}`;
  const candidate = digits.startsWith("+") ? digits : `+${bare}`;
  return E164.test(candidate) ? candidate : null;
}

export function phoneProblem(raw: string) {
  if (!raw.trim()) return null;
  if (normalizePhone(raw)) return null;
  return "Use an international number, like +63917xxxxxxx.";
}
