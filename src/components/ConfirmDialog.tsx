"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ConfirmOptions = {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  previewSrc?: string;
  previewLabel?: string;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(
  null,
);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  function settle(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
  }

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      pending.resolve(false);
      setPending(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <div
          className="confirm-scrim"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) settle(false);
          }}
        >
          <div
            className={`confirm-card${pending.previewSrc ? " has-preview" : ""}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={bodyId}
          >
            <div className="confirm-copy">
              <h2 id={titleId}>{pending.title}</h2>
              <p id={bodyId}>{pending.body}</p>
              <div className="confirm-actions">
                <button type="button" ref={cancelRef} onClick={() => settle(false)}>
                  {pending.cancelLabel ?? "CANCEL"}
                </button>
                <button
                  type="button"
                  className={pending.danger ? "danger" : "primary"}
                  onClick={() => settle(true)}
                >
                  {pending.confirmLabel ?? "CONFIRM"}
                </button>
              </div>
            </div>
            {pending.previewSrc ? (
              <div className="confirm-preview">
                <p className="confirm-preview-label">{pending.previewLabel ?? "PDF"}</p>
                <iframe
                  title={pending.previewLabel ?? "PDF preview"}
                  src={pending.previewSrc}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm must be used within ConfirmProvider.");
  }
  return confirm;
}

export function openViewAsTab(href: string) {
  const tab = window.open(href, "live-board-preview");
  tab?.focus();
}

export function closeViewAsTab(fallback: () => void) {
  const opener = window.opener;
  if (opener && !opener.closed) {
    try {
      opener.focus();
    } catch {
      // Opener may be gone or cross-origin.
    }
    window.close();
    return;
  }
  fallback();
}
