import { useMemo } from "react";
import { useAppStore } from "../../app/store";
import { sortPeriodsByDate } from "../../shared/lib/dates";
import { PeriodCard } from "./PeriodCard";
import styles from "./PeriodList.module.css";

export function PeriodList() {
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const allPeriods = useAppStore((s) => s.periods);
  const addPeriod = useAppStore((s) => s.addPeriod);
  const addClientRow = useAppStore((s) => s.addClientRow);
  const requestExpandPeriod = useAppStore((s) => s.requestExpandPeriod);

  const periods = useMemo(
    () => sortPeriodsByDate(allPeriods.filter((p) => p.groupId === activeGroupId)),
    [allPeriods, activeGroupId]
  );

  // The FAB always targets the newest period (by From date; an undated
  // period never wins "newest" just by virtue of sorting last for
  // display purposes) — not just whichever period happens to be first.
  const newestPeriod = useMemo(() => {
    return periods.reduce<(typeof periods)[number] | undefined>((newest, p) => {
      if (!newest) return p;
      const newestTime = newest.fromDate ? Date.parse(newest.fromDate) : -Infinity;
      const pTime = p.fromDate ? Date.parse(p.fromDate) : -Infinity;
      if (pTime !== newestTime) return pTime > newestTime ? p : newest;
      return p.createdAt > newest.createdAt ? p : newest;
    }, undefined);
  }, [periods]);

  if (!activeGroupId) {
    return <div className={styles.placeholder}>Select or create a group to add a period.</div>;
  }

  function handleFabClick() {
    if (newestPeriod) {
      requestExpandPeriod(newestPeriod.id);
      addClientRow(newestPeriod.id);
    } else if (activeGroupId) {
      addPeriod(activeGroupId);
    }
  }

  return (
    <div className={styles.list}>
      {periods.length === 0 && (
        <div className={styles.placeholder}>This group has no periods yet.</div>
      )}
      {periods.map((p) => (
        <PeriodCard key={p.id} periodId={p.id} />
      ))}

      <button className={styles.fab} type="button" onClick={handleFabClick}>
        {newestPeriod ? "+ New Customer" : "+ New period"}
      </button>
    </div>
  );
}
