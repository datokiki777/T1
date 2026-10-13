import { useEffect, useRef, useState } from "react";
import { useModalStore } from "./modalStore";
import styles from "./ModalHost.module.css";

export function ModalHost() {
  const request = useModalStore((s) => s.request);
  const close = useModalStore((s) => s.close);
  const [promptValue, setPromptValue] = useState("");
  const promptInputRef = useRef<HTMLInputElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (request?.kind === "prompt") {
      setPromptValue(request.defaultValue);
    }
  }, [request]);

  useEffect(() => {
    if (!request) return;
    // Let the modal paint before focusing, otherwise some browsers ignore it.
    const id = window.setTimeout(() => {
      if (request.kind === "prompt") promptInputRef.current?.focus();
      else confirmBtnRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(id);
  }, [request]);

  if (!request) return null;

  function handleCancel() {
    if (!request) return;
    if (request.kind === "confirm") request.resolve(false);
    else request.resolve(null);
    close();
  }

  function handleConfirm() {
    if (!request) return;
    if (request.kind === "confirm") request.resolve(true);
    else request.resolve(promptValue);
    close();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") handleCancel();
    if (e.key === "Enter" && request?.kind === "prompt") {
      e.preventDefault();
      handleConfirm();
    }
  }

  return (
    <div className={styles.overlay} onKeyDown={handleKeyDown}>
      <div
        className={styles.card}
        role={request.kind === "confirm" ? "alertdialog" : "dialog"}
        aria-modal="true"
      >
        <p className={styles.message}>{request.message}</p>
        {request.kind === "prompt" && (
          <input
            ref={promptInputRef}
            className={styles.promptInput}
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            aria-label={request.message}
            autoComplete="chrome-off"
            autoCorrect="off"
            spellCheck={false}
          />
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={handleCancel}>
            {request.cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmBtnRef}
            className={
              request.kind === "confirm" && request.danger ? styles.confirmBtnDanger : styles.confirmBtn
            }
            onClick={handleConfirm}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
