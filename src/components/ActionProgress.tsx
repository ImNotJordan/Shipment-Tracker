"use client";

import type { CSSProperties, ReactNode } from "react";
import { Check, MapPin, Package, Truck } from "lucide-react";

export function ActionProgress({
  active,
  label,
  value,
  overlay,
}: {
  active: boolean;
  label: string;
  value?: number;
  overlay?: boolean;
}) {
  if (overlay) {
    return (
      <div
        className="gate-veil"
        data-active={active ? "true" : "false"}
        // Set inline on purpose: the build strips backdrop-filter from the
        // stylesheet and emits only the -webkit- alias, which does not take.
        style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
        role="status"
        aria-live="polite"
      >
        {/* Mounted only while active so the artwork animates from its first
            frame each time, rather than showing a finished state. */}
        {active ? (
          <div className="gate-veil-inner">
            <span className="run-mini" aria-hidden>
              <span className="run-mini-rail">
                <span className="run-mini-progress" />
              </span>
              <Package className="run-mini-parcel" strokeWidth={1.5} />
              <Truck className="run-mini-truck" strokeWidth={1.5} />
              <MapPin className="run-mini-pin" strokeWidth={1.5} />
              <Check className="run-mini-tick" strokeWidth={2.5} />
            </span>
            <p className="gate-veil-label">{label}</p>
          </div>
        ) : null}
      </div>
    );
  }

  const determinate = typeof value === "number";
  const pct = determinate ? Math.max(0, Math.min(100, Math.round(value * 100))) : undefined;
  const meterStyle = determinate
    ? ({ "--progress": (pct ?? 0) / 100 } as CSSProperties)
    : undefined;

  return (
    <div
      className={`action-progress${overlay ? " action-progress-ident" : ""}`}
      data-active={active ? "true" : "false"}
      data-mode={determinate ? "meter" : "scan"}
      role={overlay ? undefined : "progressbar"}
      aria-hidden={overlay || !active}
      aria-busy={overlay ? undefined : active}
      aria-label={overlay ? undefined : label}
      aria-valuemin={overlay ? undefined : 0}
      aria-valuemax={overlay ? undefined : 100}
      aria-valuenow={overlay ? undefined : pct}
      style={meterStyle}
    >
      <span className="action-progress-fill" />
    </div>
  );
}

export function BusyControl({
  active,
  label,
  value,
  children,
}: {
  active: boolean;
  label: string;
  value?: number;
  children?: ReactNode;
}) {
  return (
    <span className="busy-control">
      {children}
      <ActionProgress active={active} label={label} value={value} />
    </span>
  );
}
