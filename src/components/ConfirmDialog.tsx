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
  /* A PDF gets an iframe, artwork gets an <img>: an image in an iframe
     scrolls and sits top-left instead of showing the whole mark. */
  previewKind?: "pdf" | "image";
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(
  null,
);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
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
    const node = ref.current;
    if (!node) return;
    if (pending && !node.open) node.showModal();
    if (!pending && node.open) node.close();
  }, [pending]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={ref}
        className="confirm-dialog"
        role="alertdialog"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onCancel={(event) => {
          event.preventDefault();
          settle(false);
        }}
        onMouseDown={(event) => {
          if (event.target === ref.current) settle(false);
        }}
      >
        {pending ? (
          <div className={`confirm-card${pending.previewSrc ? " has-preview" : ""}`}>
            <div className="confirm-copy">
              <h2 id={titleId}>{pending.title}</h2>
              <p id={bodyId}>{pending.body}</p>
              <div className="confirm-actions">
                <button type="button" onClick={() => settle(false)}>
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
                {pending.previewKind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pending.previewSrc} alt="" />
                ) : (
                  <iframe title={pending.previewLabel ?? "PDF preview"} src={pending.previewSrc} />
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </dialog>
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
