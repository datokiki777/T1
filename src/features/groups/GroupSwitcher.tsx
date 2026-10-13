import { useRef, useState } from "react";
import { useAppStore } from "../../app/store";
import { confirmDialog, promptDialog } from "../../shared/modal/modalStore";
import { NumericTextField } from "../../shared/ui/NumericTextField";
import { getGroupById } from "../../shared/lib/entityLookup";
import styles from "./GroupSwitcher.module.css";

/** How long a press must be held before it counts as "long press" (ms). */
export const GROUP_SWITCHER_LONG_PRESS_MS = 500;

export function GroupSwitcher() {
  const groups = useAppStore((s) => s.groups);
  const workspace = useAppStore((s) => s.workspace);
  const mode = useAppStore((s) => s.mode);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const setActiveGroup = useAppStore((s) => s.setActiveGroup);
  const addGroup = useAppStore((s) => s.addGroup);
  const renameGroup = useAppStore((s) => s.renameGroup);
  const deleteGroup = useAppStore((s) => s.deleteGroup);
  const toggleArchiveGroup = useAppStore((s) => s.toggleArchiveGroup);
  const updateGroupSettings = useAppStore((s) => s.updateGroupSettings);
  const confirmDestructive = useAppStore((s) => s.settings.confirmDestructiveActions);

  // In Review mode this menu is for browsing/switching groups only —
  // structural edits (add/rename/archive/delete a group, change its
  // default rate/salary) are disabled and visually faded, since Review
  // is meant to be a read-only look at the data.
  const isReviewMode = mode === "review";

  const [menuOpen, setMenuOpen] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  const visibleGroups = groups.filter((g) =>
    workspace === "active" ? !g.archived : g.archived
  );
  const activeGroup = getGroupById(groups, activeGroupId);

  function cycleGroup() {
    if (visibleGroups.length === 0) return;
    const currentIndex = visibleGroups.findIndex((g) => g.id === activeGroupId);
    const next = visibleGroups[(currentIndex + 1) % visibleGroups.length];
    setActiveGroup(next.id);
  }

  function clearPressTimer() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function handlePointerDown() {
    longPressFired.current = false;
    clearPressTimer();
    pressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      setMenuOpen((v) => !v);
    }, GROUP_SWITCHER_LONG_PRESS_MS);
  }

  function handleSwitcherClick() {
    if (longPressFired.current) {
      // The long-press already toggled the menu; a short tap wasn't intended.
      longPressFired.current = false;
      return;
    }
    cycleGroup();
  }

  async function handleAddGroup() {
    if (isReviewMode) return;
    const name = await promptDialog("Group name:");
    if (name === null) return;
    await addGroup(name);
  }

  async function handleRename() {
    if (isReviewMode || !activeGroup) return;
    const name = await promptDialog("New name:", activeGroup.name);
    if (name === null) return;
    await renameGroup(activeGroup.id, name);
  }

  async function handleDelete() {
    if (isReviewMode || !activeGroup) return;
    if (
      confirmDestructive &&
      !(await confirmDialog(`Delete group "${activeGroup.name}" and all its periods?`, { danger: true }))
    ) {
      return;
    }
    await deleteGroup(activeGroup.id);
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        data-testid="group-switcher-btn"
        className={styles.switcherBtn}
        onPointerDown={handlePointerDown}
        onPointerUp={clearPressTimer}
        onPointerLeave={clearPressTimer}
        onPointerCancel={clearPressTimer}
        onClick={handleSwitcherClick}
        aria-haspopup="true"
        aria-expanded={menuOpen}
        title="Tap: next group · Long-press: menu"
      >
        <span className={styles.switcherIcon} aria-hidden="true">
          👤
        </span>
        {activeGroup ? activeGroup.name : "Select group"}
        {activeGroup?.currentCarNumber && (
          <span className={styles.switcherCarTag}>🚗 {activeGroup.currentCarNumber}</span>
        )}
      </button>

      {menuOpen && (
        <div
          className={isReviewMode ? `${styles.menuPanel} ${styles.menuPanelDimmed}` : styles.menuPanel}
          role="menu"
        >
          <div className={styles.row}>
            <button
              className={styles.btn}
              onClick={handleAddGroup}
              type="button"
              disabled={isReviewMode}
            >
              + Group
            </button>
            <button
              className={styles.btn}
              onClick={handleRename}
              type="button"
              disabled={!activeGroup || isReviewMode}
            >
              Rename
            </button>
            <button
              className={styles.btnDanger}
              onClick={handleDelete}
              type="button"
              disabled={!activeGroup || isReviewMode}
            >
              Delete
            </button>
            <button
              className={styles.btn}
              onClick={() => activeGroup && !isReviewMode && toggleArchiveGroup(activeGroup.id)}
              type="button"
              disabled={!activeGroup || isReviewMode}
              title="Archive / Restore"
              aria-label="Archive / Restore"
            >
              📦
            </button>
          </div>

          <div className={styles.settingsRow}>
            <label className={styles.settingsField}>
              <span>Default %</span>
              <NumericTextField
                allowDecimal
                disabled={!activeGroup || isReviewMode}
                syncKey={activeGroup?.id ?? "none"}
                value={activeGroup?.defaultRate ?? 0}
                onChange={(n) => activeGroup && !isReviewMode && updateGroupSettings(activeGroup.id, { defaultRate: n })}
              />
            </label>
            <label className={styles.settingsField}>
              <span>Default salary / 28d</span>
              <NumericTextField
                disabled={!activeGroup || isReviewMode}
                syncKey={activeGroup?.id ?? "none"}
                value={activeGroup?.defaultSalary ?? 0}
                onChange={(n) => activeGroup && !isReviewMode && updateGroupSettings(activeGroup.id, { defaultSalary: n })}
              />
            </label>
            <label className={styles.settingsField}>
              <span>Current car number</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="chrome-off"
                disabled={!activeGroup || isReviewMode}
                value={activeGroup?.currentCarNumber ?? ""}
                placeholder="—"
                onChange={(e) => {
                  if (!activeGroup || isReviewMode) return;
                  const digits = e.target.value.replace(/\D/g, "");
                  updateGroupSettings(activeGroup.id, { currentCarNumber: digits || null });
                }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
