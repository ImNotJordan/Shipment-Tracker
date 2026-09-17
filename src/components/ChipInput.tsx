"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { normalizePhone, typedPhone } from "@/lib/phones";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One recipient per chip, committed on Enter.
 *
 *  The value stays a newline-joined string, exactly as the notify draft and
 *  the invite draft already hold it, so every save path and the API contract
 *  are untouched — only the way it is typed changes. */
export function ChipInput({
  id,
  kind,
  value,
  disabled,
  placeholder,
  describedBy,
  onChange,
}: {
  id: string;
  kind: "email" | "phone";
  value: string;
  disabled?: boolean;
  placeholder?: string;
  describedBy?: string;
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const entries = value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  /** Adds one entry. Refuses rather than silently dropping it, so a typo is
   *  visible at the moment it is made instead of at save time. */
  function commit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const clean =
      kind === "email" ? trimmed.toLowerCase() : normalizePhone(trimmed);
    if (kind === "email" && !EMAIL.test(clean as string)) {
      setError(`${trimmed} is not an email address.`);
      return;
    }
    if (!clean) {
      setError("Use a full number with country code, like +12095551212.");
      return;
    }
    setDraft("");
    setError(null);
    if (entries.includes(clean)) return;
    onChange([...entries, clean].join("\n"));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      // Enter belongs to this field, not to the form around it.
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === "Backspace" && !draft && entries.length) {
      // Backspace on an empty field takes the last chip back for editing,
      // rather than doing nothing.
      event.preventDefault();
      const last = entries[entries.length - 1];
      onChange(entries.slice(0, -1).join("\n"));
      setDraft(last);
    }
  }

  return (
    <div className="ops-chips">
      {entries.length ? (
        <ul className="ops-chip-list">
          {entries.map((entry) => (
            <li key={entry} className="ops-chip">
              <span>{entry}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${entry}`}
                onClick={() => onChange(entries.filter((item) => item !== entry).join("\n"))}
              >
                <X size={11} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        id={id}
        type={kind === "email" ? "email" : "tel"}
        inputMode={kind === "email" ? "email" : "tel"}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          setError(null);
          const next = event.target.value;
          // A number always starts at the country code, so the + is put there
          // rather than left as something to remember, and anything that is not
          // a digit never lands in the field at all.
          setDraft(kind === "phone" ? typedPhone(next) : next);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
      />
      {error ? (
        <p className="tone-bad" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
