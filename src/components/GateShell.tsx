"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActionProgress } from "./ActionProgress";
import { BrandMark } from "./BrandMark";
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
  const id = `${label.toLowerCase().replace(/\s+/g, "-")}-field`;
  return (
    <div className="gate-field">
      <span className="gate-field-head">
        <label htmlFor={id}>{label}</label>
        <button
          type="button"
          className="gate-reveal"
          onClick={() => setVisible((open) => !open)}
          disabled={disabled}
          aria-pressed={visible}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? "HIDE" : "SHOW"}
        </button>
      </span>
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
      />
    </div>
  );
}

export function GateShell({
  children,
  pending = false,
  copy = "Company-scoped FedEx tracking. Sign in to open only your board.",
  progressLabel = "SIGNING IN",
}: {
  children: ReactNode;
  pending?: boolean;
  copy?: string;
  progressLabel?: string;
}) {
  const markRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    pulsePanel(markRef.current);
  }, []);

  return (
    <main className="gate">
      <header className="ident">
        <div className="ident-left">
          <BrandMark />
          <h1 className="wordmark">LIVE BOARD</h1>
        </div>
        <div className="ident-right">
          <GateClock />
        </div>
        <ActionProgress overlay active={pending} label={progressLabel} />
      </header>
      <div className="gate-stage">
        <section className="gate-hero">
          <div className="gate-mark-well" ref={markRef}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/tracking-mark-b-route.svg"
              alt=""
              className="gate-mark"
            />
            <span className="gate-live-bar" aria-hidden />
          </div>
          <p className="gate-copy">{copy}</p>
        </section>
        <section className="gate-card">{children}</section>
      </div>
    </main>
  );
}
