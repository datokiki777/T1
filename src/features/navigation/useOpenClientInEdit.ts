import { useAppStore } from "../../app/store";

export interface ClientNavigationTarget {
  rowId: string;
  periodId: string;
  groupId: string;
  groupArchived: boolean;
}

/**
 * Shared "jump to this client in Edit mode" behavior, used by both
 * Review/Search results and the Overview status-filtered client list:
 * switches to the right workspace tab, selects the group, force-expands
 * the target period (periods start collapsed), switches to Edit mode,
 * then scrolls to and briefly highlights the row once it's rendered.
 */
export function useOpenClientInEdit() {
  const setWorkspace = useAppStore((s) => s.setWorkspace);
  const setActiveGroup = useAppStore((s) => s.setActiveGroup);
  const requestExpandPeriod = useAppStore((s) => s.requestExpandPeriod);
  const setMode = useAppStore((s) => s.setMode);
  const highlightRow = useAppStore((s) => s.highlightRow);

  return function openClientInEdit(target: ClientNavigationTarget) {
    setWorkspace(target.groupArchived ? "archive" : "active");
    setActiveGroup(target.groupId);
    requestExpandPeriod(target.periodId);
    setMode("edit");

    // Give the edit view a moment to render the target group/period before
    // scrolling to and highlighting the row.
    setTimeout(() => {
      const rowEl = document.querySelector(`tr[data-row-id="${target.rowId}"]`);
      rowEl?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      highlightRow(target.rowId);
    }, 80);
  };
}
