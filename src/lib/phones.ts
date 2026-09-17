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

export function parsePhoneList(value: unknown): { phones: string[]; invalid: string[] } {
  const raw = Array.isArray(value) ? value.join("\n") : String(value ?? "");
  const tokens = raw
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const phones: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const phone = normalizePhone(token);
    if (!phone) {
      invalid.push(token);
      continue;
    }
    if (seen.has(phone)) continue;
    seen.add(phone);
    phones.push(phone);
  }
  return { phones, invalid };
}

export function phoneProblem(raw: string) {
  if (!raw.trim()) return null;
  if (normalizePhone(raw)) return null;
  return "Use a full number with country code, like +12095551212.";
}

export function phoneListProblem(raw: string) {
  const { invalid } = parsePhoneList(raw);
  if (!invalid.length) return null;
  return `Invalid number: ${invalid[0]}. Use a full number with country code, like +12095551212.`;
}
