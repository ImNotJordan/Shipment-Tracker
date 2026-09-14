"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowBigUp, Check, Eye, EyeOff, MapPin, Package, Truck } from "lucide-react";
import { ActionProgress } from "./ActionProgress";
import { BrandMark } from "./BrandMark";
import { GateMark } from "./GateMark";
import { ThemeToggle } from "./ThemeToggle";
import { pulsePanel } from "@/lib/ops-motion";

function GateClock() {
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "UTC",
        }).format(new Date()) + " UTC",
      );
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <p className="last-fetch">
      {clock || "—"}
      <span className="pip" aria-hidden />
    </p>
  );
}

export function GatePasswordField({
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);
  const id = `${label.toLowerCase().replace(/\s+/g, "-")}-field`;
  return (
    <div
      className="gate-field"
      onBlur={(event) => {
        // Tabbing or clicking onto the reveal button is still inside the field,
        // so only drop the caps hint when focus actually leaves.
        if (!event.currentTarget.contains(event.relatedTarget)) setCaps(false);
      }}
    >
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => setCaps(event.getModifierState("CapsLock"))}
        onKeyUp={(event) => setCaps(event.getModifierState("CapsLock"))}
        placeholder=" "
        required={required}
        disabled={disabled}
      />
      <label htmlFor={id}>{label}</label>
      <span className="gate-field-tools">
        {caps ? (
          <span className="gate-caps" title="Caps lock is on">
            <ArrowBigUp strokeWidth={2.5} aria-hidden />
            <span className="sr-only" role="status">
              Caps lock is on
            </span>
          </span>
        ) : null}
        <button
          type="button"
          className="gate-reveal"
          onClick={() => setVisible((open) => !open)}
          disabled={disabled}
          aria-pressed={visible}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </button>
      </span>
    </div>
  );
}

export function GateShell({
  children,
  pending = false,
  leaving = false,
  copy = "Company-scoped FedEx tracking.",
  progressLabel = "SIGNING IN",
}: {
  children: ReactNode;
  pending?: boolean;
  leaving?: boolean;
  copy?: string;
  progressLabel?: string;
}) {
  const markRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    pulsePanel(markRef.current);
  }, []);

  return (
    <main className={leaving ? "gate is-leaving" : "gate"}>
      <header className="ident">
        <div className="ident-left">
          <BrandMark />
          <div className="ident-slot">
            <h1 className="wordmark">LIVE&nbsp;BOARD</h1>
          </div>
        </div>
        <div className="ident-right">
          <ThemeToggle />
          <GateClock />
        </div>
        <ActionProgress overlay active={pending} label={progressLabel} />
      </header>
      <div className="gate-stage">
        <section className="gate-hero">
          <div className="gate-mark-well" ref={markRef}>
            <GateMark />
          </div>
          <p className="gate-copy">{copy}</p>
          {/* One shipment, origin to delivered. Symbolic only — no tracking
              number, company or time, so it states nothing it cannot know. */}
          <div className="gate-run" aria-hidden>
            <span className="gate-run-rail">
              <span className="gate-run-progress" />
            </span>
            <Package className="gate-run-origin" strokeWidth={1.5} />
            <MapPin className="gate-run-dest" strokeWidth={1.5} />
            <Check className="gate-run-done" strokeWidth={2.5} />
            <Truck className="gate-run-truck" strokeWidth={1.5} />
          </div>
        </section>
        <section className="gate-card">{children}</section>
      </div>
    </main>
  );
}
