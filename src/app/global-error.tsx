"use client";

import React, { useEffect } from "react";

/**
 * Global error boundary (ROLE_UI_AUDIT C2) — last resort when even the root
 * layout fails. Must render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error-boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f8fafc" }}>
        <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 32, textAlign: "center" }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: "0 0 8px" }}>Application error</h1>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 16px" }}>
              A critical error occurred. Please reload the application.
            </p>
            {error?.digest && (
              <p style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace", margin: "0 0 16px" }}>Ref: {error.digest}</p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                onClick={reset}
                style={{ padding: "8px 16px", borderRadius: 12, background: "#4f46e5", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
