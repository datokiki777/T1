import { useEffect, useRef, useState } from "react";

interface NumericTextFieldProps {
  value: number;
  onChange: (value: number) => void;
  /** When this changes (e.g. switching to a different group), the field
   * re-syncs its displayed text from `value`. Otherwise the field's own
   * typed text is authoritative — it's never silently overwritten mid-edit
   * just because Number("") happens to equal 0. */
  syncKey: string;
  allowDecimal?: boolean;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}

/**
 * Replaces a plain `<input type="number">` for rate/salary-style fields.
 *
 * Native number inputs re-derive their displayed text from the numeric
 * value on every render. Since Number("") is 0 in JS, clearing the field
 * (even mid-edit, not just on first focus) makes the control's value
 * become 0 and immediately re-render as "0" — so continuing to type after
 * deleting appends onto that "0" instead of replacing it ("035" instead
 * of "35"). This component keeps the person's own typed text as the
 * source of truth for what's displayed, only re-syncing from the
 * underlying number when `syncKey` changes (e.g. switching groups) —
 * clearing the field and typing again just works, at any point in the
 * edit, not only on the very first tap-in.
 */
export function NumericTextField({
  value,
  onChange,
  syncKey,
  allowDecimal = false,
  disabled,
  id,
  "aria-label": ariaLabel,
}: NumericTextFieldProps) {
  const [text, setText] = useState(() => String(value));
  const lastSyncKey = useRef(syncKey);

  useEffect(() => {
    if (syncKey !== lastSyncKey.current) {
      lastSyncKey.current = syncKey;
      setText(String(value));
    }
    // Only re-sync when syncKey changes, not on every `value` change —
    // that's the whole point (avoids clobbering in-progress typing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value;
    if (allowDecimal) {
      raw = raw.replace(/[^0-9.]/g, "");
      const firstDot = raw.indexOf(".");
      if (firstDot !== -1) {
        raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, "");
      }
    } else {
      raw = raw.replace(/\D/g, "");
    }
    setText(raw);
    onChange(raw === "" || raw === "." ? 0 : Number(raw));
  }

  return (
    <input
      id={id}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      value={text}
      onChange={handleChange}
      disabled={disabled}
      aria-label={ariaLabel}
      autoComplete="chrome-off"
    />
  );
}
