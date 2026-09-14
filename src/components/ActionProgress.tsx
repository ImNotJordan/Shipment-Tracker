"use client";

import type { CSSProperties, ReactNode } from "react";

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
