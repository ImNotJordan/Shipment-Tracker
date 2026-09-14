export function parseEmailList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join("\n") : String(value ?? "");
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)),
    ),
  ];
}
