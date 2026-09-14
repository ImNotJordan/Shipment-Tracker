"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ackFlash } from "@/lib/ops-motion";

export type OpsToastTone = "ok" | "bad";

type OpsToastState = {
  tone: OpsToastTone;
  message: string;
  id: number;
};

export function useOpsToast(duration = 3600) {
  const [toast, setToast] = useState<OpsToastState | null>(null);

  const dismiss = useCallback(() => setToast(null), []);

  const show = useCallback((tone: OpsToastTone, message: string) => {
    setToast({ tone, message, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), duration);
    return () => window.clearTimeout(timer);
  }, [toast, duration]);

  return { toast, show, dismiss };
}

export function OpsToast({
  toast,
  onDismiss,
}: {
  toast: OpsToastState | null;
  onDismiss: () => void;
}) {
  const nodeRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (toast) ackFlash(nodeRef.current);
  }, [toast]);

  if (!mounted || !toast) return null;

  return createPortal(
    <button
      ref={nodeRef}
      type="button"
      className={`ops-toast ${toast.tone === "bad" ? "is-bad" : "is-ok"}`}
      role="status"
      onClick={onDismiss}
    >
      <span className="ops-toast-kicker">{toast.tone === "bad" ? "ERROR" : "OK"}</span>
      <span className="ops-toast-copy">{toast.message}</span>
    </button>,
    document.body,
  );
}
