"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

/* ─────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────── */
type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  startLoading: (message?: string) => void;
  stopLoading: () => void;
  withLoading: <T>(action: Promise<T> | (() => Promise<T>), message?: string) => Promise<T>;
  isLoading: boolean;
  loadingMessage: string;
}

/* ─────────────────────────────────────────────────────────
   CONTEXT
───────────────────────────────────────────────────────── */
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/* ─────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────── */
const TOAST_DURATION_MS = 4500;
const MAX_VISIBLE_TOASTS = 3;
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* ─────────────────────────────────────────────────────────
   ICONS (inline SVG to avoid extra imports)
───────────────────────────────────────────────────────── */
const ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="tt-icon" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="tt-icon" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="tt-icon" aria-hidden="true">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="tt-icon" aria-hidden="true">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  ),
};

/* ─────────────────────────────────────────────────────────
   PROVIDER
───────────────────────────────────────────────────────── */
let _nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toastPaused, setToastPaused] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState("Processing request...");

  const toastTimers = useRef<
    Map<number, { timer: ReturnType<typeof setTimeout> | null; remaining: number; startedAt: number | null }>
  >(new Map());

  // Confirm modal state
  const [confirmState, setConfirmState] = useState<ConfirmOptions & { visible: boolean }>({
    visible: false,
    message: "",
  });
  const confirmResolve = useRef<((value: boolean) => void) | null>(null);
  const confirmModalRef = useRef<HTMLDivElement | null>(null);
  const confirmCancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRestoreFocus = useRef<HTMLElement | null>(null);
  const confirmTitleId = useId();
  const confirmMessageId = useId();

  /* -- action loading API -- */
  const startLoading = useCallback((message = "Processing request...") => {
    setActionMessage(message);
    setIsActionLoading(true);
  }, []);

  const stopLoading = useCallback(() => {
    setIsActionLoading(false);
  }, []);

  const withLoading = useCallback(async <T,>(action: Promise<T> | (() => Promise<T>), message = "Processing request..."): Promise<T> => {
    startLoading(message);
    try {
      const result = typeof action === "function" ? await action() : await action;
      return result;
    } finally {
      stopLoading();
    }
  }, [startLoading, stopLoading]);

  /* -- toast API -- */
  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++_nextId;
    setToasts((prev) => [...prev, { id, message, type }].slice(-MAX_VISIBLE_TOASTS));
  }, []);

  // WF-P05: Global custom event listener so non-React helpers (exportToPrintablePDF, etc.)
  // can surface non-blocking toasts without window.alert().
  useEffect(() => {
    const handleGlobalToast = (e: any) => {
      const { message, type } = e.detail || {};
      if (message) toast(message, type || "info");
    };
    window.addEventListener("fp_toast", handleGlobalToast);
    return () => window.removeEventListener("fp_toast", handleGlobalToast);
  }, [toast]);

  // Timers are created/cleared here so the cap, pause, and manual dismissal
  // all clean up after themselves instead of leaving orphaned timeouts.
  // Remaining-time tracking keeps the progress bar and dismissal in sync.
  useEffect(() => {
    const timers = toastTimers.current;

    if (toastPaused) {
      const now = Date.now();
      timers.forEach((entry) => {
        if (!entry.timer) return;
        clearTimeout(entry.timer);
        entry.remaining = Math.max(0, entry.remaining - (now - (entry.startedAt ?? now)));
        entry.timer = null;
        entry.startedAt = null;
      });
      return;
    }

    toasts.forEach((t) => {
      let entry = timers.get(t.id);
      if (!entry) {
        entry = { timer: null, remaining: TOAST_DURATION_MS, startedAt: null };
        timers.set(t.id, entry);
      }
      if (entry.timer) return;
      entry.startedAt = Date.now();
      entry.timer = setTimeout(() => {
        timers.delete(t.id);
        setToasts((prev) => prev.filter((item) => item.id !== t.id));
      }, entry.remaining);
    });

    timers.forEach((entry, id) => {
      if (!toasts.some((t) => t.id === id)) {
        if (entry.timer) clearTimeout(entry.timer);
        timers.delete(id);
      }
    });
  }, [toasts, toastPaused]);

  useEffect(() => {
    const timers = toastTimers.current;
    return () => {
      timers.forEach((entry) => {
        if (entry.timer) clearTimeout(entry.timer);
      });
      timers.clear();
    };
  }, []);

  /* -- confirm API -- */
  const handleConfirmChoice = useCallback((result: boolean) => {
    setConfirmState((s) => ({ ...s, visible: false }));
    const resolve = confirmResolve.current;
    confirmResolve.current = null;
    resolve?.(result);
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    // A second confirm supersedes the first; resolve the abandoned promise so
    // its caller never hangs on an invisible modal.
    confirmResolve.current?.(false);
    setConfirmState({ ...options, visible: true });
    return new Promise<boolean>((resolve) => {
      confirmResolve.current = resolve;
    });
  }, []);

  // Resolve any pending promise if the provider unmounts mid-confirm.
  useEffect(() => {
    return () => {
      confirmResolve.current?.(false);
      confirmResolve.current = null;
    };
  }, []);

  // Escape, focus trap, scroll lock, and focus restoration for the confirm modal.
  useEffect(() => {
    if (!confirmState.visible) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmRestoreFocus.current = previouslyFocused;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = setTimeout(() => confirmCancelRef.current?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleConfirmChoice(false);
        return;
      }
      if (event.key !== "Tab") return;

      const node = confirmModalRef.current;
      if (!node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null
      );

      if (focusable.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      confirmRestoreFocus.current?.focus?.();
    };
  }, [confirmState.visible, handleConfirmChoice]);

  return (
    <ToastContext.Provider value={{ toast, confirm, startLoading, stopLoading, withLoading, isLoading: isActionLoading, loadingMessage: actionMessage }}>
      {children}

      {/* ── Top Sleek Glowing Progress Bar ───────── */}
      {isActionLoading && (
        <div
          className="fixed top-0 left-0 right-0 z-[10001] h-1.5 bg-slate-200/40 dark:bg-slate-800/40 overflow-hidden pointer-events-none"
          role="progressbar"
          aria-label={actionMessage || "Processing request"}
        >
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 w-full"
          />
        </div>
      )}

      {/* ── Floating Action Progress Indicator ───── */}
      {isActionLoading && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10001] flex items-center gap-3 px-5 py-3 rounded-xl bg-slate-900/90 text-white backdrop-blur-xl border border-slate-700/80 shadow-card-lg animate-scaleUp pointer-events-none"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <div className="h-2.5 w-2.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0s", animationDuration: "0.8s" }} />
            <div className="h-2.5 w-2.5 rounded-full bg-[#4F46E5] animate-bounce" style={{ animationDelay: "0.15s", animationDuration: "0.8s" }} />
            <div className="h-2.5 w-2.5 rounded-full bg-rose-400 animate-bounce" style={{ animationDelay: "0.30s", animationDuration: "0.8s" }} />
          </div>
          <span className="text-xs font-bold tracking-wide text-slate-100">{actionMessage || "Processing request..."}</span>
        </div>
      )}

      {/* ── Toast Stack ─────────────────────────── */}
      <div
        className="tt-stack"
        data-paused={toastPaused ? "true" : "false"}
        onMouseEnter={() => setToastPaused(true)}
        onMouseLeave={() => setToastPaused(false)}
        onFocusCapture={() => setToastPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setToastPaused(false);
          }
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`tt-item tt-${t.type}`}
            role={t.type === "error" || t.type === "warning" ? "alert" : "status"}
            aria-atomic="true"
          >
            {ICONS[t.type]}
            <span className="tt-msg">{t.message}</span>
            <button
              type="button"
              className="tt-close"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
            <span className="tt-progress" aria-hidden="true" />
          </div>
        ))}
      </div>

      {/* ── Confirm Modal ───────────────────────── */}
      {confirmState.visible && (
        <div
          className="tt-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) handleConfirmChoice(false);
          }}
        >
          <div
            ref={confirmModalRef}
            className="tt-modal"
            role={confirmState.danger ? "alertdialog" : "dialog"}
            aria-modal="true"
            aria-labelledby={confirmState.title ? confirmTitleId : undefined}
            aria-describedby={confirmMessageId}
            tabIndex={-1}
          >
            {confirmState.title && (
              <h3 id={confirmTitleId} className="tt-modal-title">{confirmState.title}</h3>
            )}
            <p id={confirmMessageId} className="tt-modal-msg">{confirmState.message}</p>
            <div className="tt-modal-actions">
              <button
                ref={confirmCancelRef}
                type="button"
                className="tt-btn tt-btn-cancel"
                onClick={() => handleConfirmChoice(false)}
              >
                {confirmState.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                className={`tt-btn ${confirmState.danger ? "tt-btn-danger" : "tt-btn-confirm"}`}
                onClick={() => handleConfirmChoice(true)}
              >
                {confirmState.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* Toast stack */
        .tt-stack {
          position: fixed;
          top: calc(7.5rem + env(safe-area-inset-top, 0px));
          right: 1.5rem;
          z-index: var(--z-toast, 9999);
          display: flex;
          flex-direction: column-reverse;
          align-items: flex-end;
          gap: .625rem;
          width: min(22rem, calc(100vw - 3rem));
          pointer-events: none;
        }

        /* Individual toast */
        .tt-item {
          position: relative;
          display: flex;
          align-items: flex-start;
          gap: .625rem;
          width: 100%;
          padding: .75rem 1rem .875rem;
          border-radius: .75rem;
          font-size: .875rem;
          font-weight: 500;
          line-height: 1.4;
          overflow: hidden;
          box-shadow: 0 12px 32px rgba(0,0,0,.28);
          backdrop-filter: blur(12px);
          pointer-events: auto;
          animation: tt-slide-in .32s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          border: 1px solid transparent;
        }
        @keyframes tt-slide-in {
          from { opacity: 0; transform: translateY(-16px) scale(.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .tt-success { background: rgba(4,120,87,.94);  border-color: rgba(16,185,129,.55); color: #ecfdf5; }
        .tt-error   { background: rgba(153,27,27,.94); border-color: rgba(248,113,113,.5);  color: #fef2f2; }
        .tt-info    { background: rgba(49,46,129,.94); border-color: rgba(129,140,248,.5);  color: #eef2ff; }
        .tt-warning { background: rgba(124,45,18,.94); border-color: rgba(251,191,36,.5);   color: #fffbeb; }

        .tt-icon { width: 1.125rem; height: 1.125rem; flex-shrink: 0; margin-top: .1rem; }
        .tt-msg  { flex: 1; }
        .tt-close {
          background: none; border: none; cursor: pointer;
          font-size: 1.1rem; line-height: 1;
          opacity: .6; padding: 0 .1rem;
          color: inherit;
          border-radius: .25rem;
        }
        .tt-close:hover { opacity: 1; }
        .tt-close:focus-visible {
          outline: 2px solid currentColor;
          outline-offset: 2px;
          opacity: 1;
        }

        /* Auto-dismiss progress */
        .tt-progress {
          position: absolute;
          left: 0;
          bottom: 0;
          height: 2px;
          width: 100%;
          background: currentColor;
          opacity: .45;
          transform-origin: left center;
          animation: tt-progress ${TOAST_DURATION_MS}ms linear forwards;
        }
        @keyframes tt-progress {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
        .tt-stack[data-paused="true"] .tt-progress {
          animation-play-state: paused;
        }

        /* Confirm modal backdrop */
        .tt-backdrop {
          position: fixed; inset: 0; z-index: var(--z-modal, 10000);
          background: rgba(0,0,0,.55);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          padding: 1rem;
          animation: tt-fade-in .2s ease;
        }
        @keyframes tt-fade-in {
          from { opacity:0; } to { opacity:1; }
        }

        /* Modal card */
        .tt-modal {
          background: var(--modal-bg, #1e1e2e);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 1rem;
          padding: 1.75rem 2rem;
          max-width: 26rem;
          width: 100%;
          max-height: 85vh;
          overflow-y: auto;
          box-shadow: 0 24px 64px rgba(0,0,0,.4);
          animation: tt-pop-in .32s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .tt-modal:focus { outline: none; }
        @keyframes tt-pop-in {
          from { opacity: 0; transform: scale(.92); }
          to   { opacity: 1; transform: scale(1); }
        }
        :root:not(.dark) .tt-modal {
          background: #fff;
          border-color: rgba(0,0,0,.1);
          box-shadow: 0 16px 48px rgba(0,0,0,.15);
        }

        .tt-modal-title {
          font-size: 1.05rem; font-weight: 700;
          margin: 0 0 .5rem; color: inherit;
        }
        .tt-modal-msg {
          font-size: .9rem; line-height: 1.55;
          color: rgba(255,255,255,.7);
          margin: 0 0 1.5rem;
        }
        :root:not(.dark) .tt-modal-msg { color: #374151; }

        .tt-modal-actions {
          display: flex; justify-content: flex-end; gap: .625rem;
        }
        .tt-btn {
          padding: .5rem 1.1rem; border-radius: .5rem;
          font-size: .875rem; font-weight: 600;
          cursor: pointer; border: none; transition: opacity .15s;
        }
        .tt-btn:hover { opacity: .85; }
        .tt-btn:focus-visible {
          outline: 2px solid currentColor;
          outline-offset: 2px;
        }
        .tt-btn-cancel  { background: rgba(255,255,255,.1); color: inherit; }
        :root:not(.dark) .tt-btn-cancel { background: #e5e7eb; color: #374151; }
        .tt-btn-confirm { background: #6366f1; color: #fff; }
        .tt-btn-danger  { background: #ef4444; color: #fff; }

        @media (max-width: 767px) {
          .tt-stack {
            left: 1rem;
            right: 1rem;
            top: calc(5rem + env(safe-area-inset-top, 0px));
            width: auto;
            align-items: stretch;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .tt-item, .tt-modal, .tt-backdrop {
            animation: none;
          }
          .tt-progress {
            animation: none;
            transform: scaleX(1);
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
