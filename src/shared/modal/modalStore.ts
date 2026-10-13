import { create } from "zustand";

export type ModalRequest =
  | {
      kind: "confirm";
      message: string;
      confirmLabel: string;
      cancelLabel: string;
      danger: boolean;
      resolve: (ok: boolean) => void;
    }
  | {
      kind: "prompt";
      message: string;
      defaultValue: string;
      confirmLabel: string;
      cancelLabel: string;
      resolve: (value: string | null) => void;
    };

interface ModalStoreState {
  request: ModalRequest | null;
  open: (request: ModalRequest) => void;
  close: () => void;
}

export const useModalStore = create<ModalStoreState>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));

/**
 * Drop-in async replacement for window.confirm(), but rendered as a nice
 * in-app modal instead of the browser/OS chrome dialog. Resolves true if
 * the person confirmed, false if they cancelled (or dismissed).
 */
export function confirmDialog(
  message: string,
  opts?: { confirmLabel?: string; cancelLabel?: string; danger?: boolean }
): Promise<boolean> {
  return new Promise((resolve) => {
    useModalStore.getState().open({
      kind: "confirm",
      message,
      confirmLabel: opts?.confirmLabel ?? "Yes",
      cancelLabel: opts?.cancelLabel ?? "Cancel",
      danger: opts?.danger ?? false,
      resolve,
    });
  });
}

/**
 * Drop-in async replacement for window.prompt(), rendered in-app. Resolves
 * the entered string, or null if cancelled — same contract as window.prompt.
 */
export function promptDialog(
  message: string,
  defaultValue = "",
  opts?: { confirmLabel?: string; cancelLabel?: string }
): Promise<string | null> {
  return new Promise((resolve) => {
    useModalStore.getState().open({
      kind: "prompt",
      message,
      defaultValue,
      confirmLabel: opts?.confirmLabel ?? "OK",
      cancelLabel: opts?.cancelLabel ?? "Cancel",
      resolve,
    });
  });
}
