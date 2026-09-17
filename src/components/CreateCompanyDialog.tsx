"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { ActionProgress, BusyControl } from "./ActionProgress";
import { FALLBACK, paletteFromFile, type Palette } from "@/lib/logo-palette";

export type NewCompany = {
  name: string;
  logo: File | null;
  accent: string;
  background: string;
};

/* Native <dialog> carries the modal semantics, Escape, focus return and the
   backdrop, so none of that is re-implemented here. */
export function CreateCompanyDialog({
  open,
  busy,
  busyLabel,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  busyLabel: string;
  onClose: () => void;
  onSubmit: (company: NewCompany) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [palette, setPalette] = useState<Palette>(FALLBACK);
  const [accent, setAccent] = useState(FALLBACK.accents[0]);
  const [background, setBackground] = useState(FALLBACK.backgrounds[0]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  useEffect(() => {
    if (open) return;
    setName("");
    setLogo(null);
    setPalette(FALLBACK);
    setAccent(FALLBACK.accents[0]);
    setBackground(FALLBACK.backgrounds[0]);
  }, [open]);

  useEffect(() => {
    if (!logo) {
      setLogoUrl(null);
      return;
    }
    const url = URL.createObjectURL(logo);
    setLogoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  async function onPickLogo(file: File | undefined) {
    setLogo(file ?? null);
    const next = file ? await paletteFromFile(file) : FALLBACK;
    setPalette(next);
    setAccent(next.accents[0]);
    setBackground(next.backgrounds[0]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ name, logo, accent, background });
  }

  return (
    <dialog
      ref={ref}
      className="ops-dialog"
      aria-label="Create company"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === ref.current && !busy) onClose();
      }}
    >
      <form className="ops-form ops-create" onSubmit={submit}>
        <header className="ops-create-head">
          <h2>Create company</h2>
          <button type="button" className="ops-dialog-close" onClick={onClose} disabled={busy}>
            CLOSE
          </button>
        </header>
        <p>Each company is a sealed tenant. Clients only see their own live board.</p>

        <div className="ops-create-top">
          <div>
            <label className="ops-file">
              LOGO
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                disabled={busy}
                onChange={(event) => void onPickLogo(event.target.files?.[0])}
              />
            </label>
            <label>
              COMPANY NAME
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ronin"
                required
                disabled={busy}
              />
            </label>
          </div>
          <div className="ops-logo-well" style={{ background }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" />
            ) : (
              <span>LOGO</span>
            )}
          </div>
        </div>

        <p className="ops-meta">
          {logo ? "Suggested palette from the logo" : "Default board palette — add a logo to read one from it"}
        </p>
        <Swatches
          label="ACCENT"
          options={palette.accents}
          value={accent}
          disabled={busy}
          onPick={setAccent}
        />
        <Swatches
          label="BACKGROUND"
          options={palette.backgrounds}
          value={background}
          disabled={busy}
          onPick={setBackground}
        />

        <BusyControl active={busy} label={busy ? busyLabel : "Creating company"}>
          <button className="primary ops-create-go" type="submit" disabled={busy}>
            <Plus size={12} aria-hidden />
            {busy ? busyLabel : "CREATE COMPANY"}
          </button>
        </BusyControl>
      </form>
      {/* Mounted inside the dialog on purpose: a modal sits in the browser's
          top layer, so the console's own veil cannot reach over it. */}
      <ActionProgress overlay active={busy} label={busyLabel} />
    </dialog>
  );
}

function Swatches({
  label,
  options,
  value,
  disabled,
  onPick,
}: {
  label: string;
  options: string[];
  value: string;
  disabled: boolean;
  onPick: (color: string) => void;
}) {
  return (
    <fieldset className="ops-swatches" disabled={disabled}>
      <legend>{label}</legend>
      {options.map((color) => (
        <label key={color} className={color === value ? "is-on" : undefined}>
          <input
            type="radio"
            name={label}
            checked={color === value}
            onChange={() => onPick(color)}
          />
          <span style={{ background: color }} aria-hidden />
          {color.toUpperCase()}
        </label>
      ))}
      <label className="ops-swatch-custom">
        <input
          type="color"
          value={value}
          aria-label={`Custom ${label.toLowerCase()}`}
          onChange={(event) => onPick(event.target.value)}
        />
        CUSTOM
      </label>
    </fieldset>
  );
}
