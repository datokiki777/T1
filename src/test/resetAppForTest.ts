import { db } from "../db/database";
import { useAppStore } from "../app/store";
import { useModalStore } from "../shared/modal/modalStore";
import { act, fireEvent, screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { GROUP_SWITCHER_LONG_PRESS_MS } from "../features/groups/GroupSwitcher";

// --- In-app modal auto-answer (replaces vi.spyOn(window, "confirm"/"prompt")
// now that confirm()/prompt() are rendered as an in-app <ModalHost/> instead
// of the browser's native dialogs). Ergonomics deliberately mirror
// mockReturnValue: set once, and every subsequent confirm/prompt in the
// test resolves with that value until cleared. ---
let mockedConfirmAnswer: boolean | undefined;
let mockedPromptAnswer: string | null | undefined;
let modalOpenCount = 0;
let lastSeenModalRequest: unknown = null;

useModalStore.subscribe((state) => {
  const req = state.request;
  if (req && req !== lastSeenModalRequest) {
    modalOpenCount++;
    lastSeenModalRequest = req;
  }
  if (!req) lastSeenModalRequest = null;

  if (req?.kind === "confirm" && mockedConfirmAnswer !== undefined) {
    req.resolve(mockedConfirmAnswer);
    useModalStore.getState().close();
  } else if (req?.kind === "prompt" && mockedPromptAnswer !== undefined) {
    req.resolve(mockedPromptAnswer);
    useModalStore.getState().close();
  }
});

export function mockModalConfirm(answer: boolean) {
  mockedConfirmAnswer = answer;
}

export function mockModalPrompt(answer: string | null) {
  mockedPromptAnswer = answer;
}

/** How many confirm/prompt modals have been opened since the last reset —
 * the equivalent of asserting a window.confirm spy's call count. */
export function getModalOpenCount(): number {
  return modalOpenCount;
}

export function resetModalOpenCount(): void {
  modalOpenCount = 0;
}

function clearModalMocks() {
  mockedConfirmAnswer = undefined;
  mockedPromptAnswer = undefined;
  modalOpenCount = 0;
  lastSeenModalRequest = null;
}

/**
 * Resets both IndexedDB and the in-memory Zustand store between e2e tests.
 *
 * Store mutations are optimistic/fire-and-forget (state updates
 * synchronously, the IndexedDB write happens in the background) — so a
 * write still in flight from the previous test could otherwise land in
 * IndexedDB *after* we've cleared it here. The short delay lets any such
 * writes finish before we reset, so no state leaks across tests.
 */
export async function resetAppForTest(): Promise<void> {
  clearModalMocks();
  localStorage.removeItem("t1:last-mode");
  await db.groups.clear();
  await db.periods.clear();
  await db.clientRows.clear();
  await db.settings.clear();
  await db.syncMeta.clear();
  await new Promise((r) => setTimeout(r, 30));

  useAppStore.setState({
    groups: [],
    periods: [],
    clientRows: [],
    activeGroupId: null,
    lastActiveGroupIdActive: null,
    lastActiveGroupIdArchive: null,
    mode: "edit",
    workspace: "active",
    totalsScope: "current",
    highlightedRowId: null,
    highlightedPeriodId: null,
    expandPeriodId: null,
    dataUpdatedAt: null,
    cloudStatus: "idle",
    cloudError: null,
    cloudUserEmail: null,
    cloudConflict: null,
    cloudLastSyncDetail: null,
    cloudLastSyncedAt: null,
    lastBackupAt: null,
    settings: {
      id: "app",
      defaultSalary: 0,
      currencySymbol: "€",
      confirmDestructiveActions: true,
    },
    loaded: false,
    initError: null,
  });
}

/**
 * Simulates a real long-press on the group switcher button (pointerdown,
 * wait past the long-press threshold, pointerup) to open its management
 * menu (+ Group / Rename / Delete / Archive / Default %/salary). A plain
 * click on that button cycles the active group instead — see
 * GroupSwitcher.tsx.
 */
export async function openGroupMenu(): Promise<void> {
  const btn = screen.getByTestId("group-switcher-btn");
  await act(async () => {
    fireEvent.pointerDown(btn);
    await new Promise((r) => setTimeout(r, GROUP_SWITCHER_LONG_PRESS_MS + 80));
    fireEvent.pointerUp(btn);
  });
}

/**
 * PeriodCard now starts collapsed by default (matching the old app), so
 * every e2e test that needs to reach the client table or the From/To/Paid
 * weeks fields must expand it first by clicking its "Period" header.
 */
export async function expandFirstPeriod(user: UserEvent): Promise<void> {
  const [firstPeriodBtn] = screen.getAllByTestId("period-collapse-btn");
  await user.click(firstPeriodBtn);
}
