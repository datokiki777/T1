import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, cleanup, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { db } from "../db/database";
import { resetAppForTest, openGroupMenu, expandFirstPeriod, mockModalPrompt, mockModalConfirm } from "../test/resetAppForTest";

describe("Client table CRUD (end-to-end against real IndexedDB)", () => {
  beforeEach(async () => {
    await resetAppForTest();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("adds a group, a period, and a client row; edits persist to IndexedDB; My€ is correct", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Test Group");

    render(<App />);

    // Wait for initial load to finish.
    expect(await screen.findByText("Select group")).toBeInTheDocument();

    // 1. Create a group (long-press the group switcher to open its menu first).
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    expect(await screen.findByRole("button", { name: /Test Group/ })).toBeInTheDocument();

    // 2. Create a period.
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    expect(await screen.findByText("+ Add client")).toBeInTheDocument();

    // 3. Add a client row.
    await user.click(screen.getByRole("button", { name: "+ Add client" }));

    const table = screen.getByRole("table");
    const customerInput = within(table).getByPlaceholderText("Client name");
    const grossInputs = within(table).getAllByPlaceholderText("0");
    const [grossInput, netInput] = grossInputs;
    const cityInput = within(table).getByPlaceholderText("City");

    await user.type(customerInput, "Acme Corp");
    await user.type(grossInput, "1000");
    await user.type(cityInput, "Tbilisi");

    // No Expense entered yet -> My€ equals the Amount.
    await screen.findByDisplayValue("1000");

    // 4. Verify it actually persisted to IndexedDB (not just in-memory state).
    const rowsAfterGross = await db.clientRows.toArray();
    expect(rowsAfterGross).toHaveLength(1);
    expect(rowsAfterGross[0].customer).toBe("Acme Corp");
    expect(rowsAfterGross[0].amount).toBe("1000");
    expect(rowsAfterGross[0].city).toBe("Tbilisi");

    const periodsAfter = await db.periods.toArray();
    expect(periodsAfter).toHaveLength(1);

    // Expected My€ = amount (1000) − expense (empty = 0) = 1000.
    await screen.findByTestId("period-total-my-eur");
    expect(screen.getByTestId("period-total-my-eur")).toHaveTextContent("1000");

    // 5. Enter an Expense of 300 — My€ becomes 1000 − 300 = 700.
    await user.type(netInput, "300");
    await waitFor(() =>
      expect(screen.getByTestId("period-total-my-eur")).toHaveTextContent("700")
    );

    const rowsAfterExpense = await db.clientRows.toArray();
    expect(rowsAfterExpense[0].expense).toBe("300");

    // 6. Delete the row (confirm dialog must be accepted).
    mockModalConfirm(true);
    await user.click(within(table).getByRole("button", { name: "Remove" }));

    const rowsAfterDelete = await db.clientRows.toArray();
    expect(rowsAfterDelete).toHaveLength(0);
  });

  it("excludes rows marked 'wrong' from My€ but keeps them visible in the table", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Group W");

    render(<App />);

    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    await user.click(screen.getByRole("button", { name: "+ Add client" }));

    const table = screen.getByRole("table");
    const grossInput = within(table).getAllByPlaceholderText("0")[0];
    await user.type(grossInput, "500");

    await waitFor(() =>
      expect(screen.getByTestId("period-total-my-eur")).toHaveTextContent("500")
    ); // amount 500 − empty expense

    // Cycle status: none -> done -> fail -> fixed -> wrong
    const statusBtn = within(table).getByRole("button", { name: "—" });
    await user.click(statusBtn); // done
    await user.click(screen.getByRole("button", { name: "✓ Done" })); // fail
    await user.click(screen.getByRole("button", { name: "✕ Fail" })); // fixed
    await user.click(screen.getByRole("button", { name: "⟳ Fixed" })); // wrong

    expect(await screen.findByRole("button", { name: "! Wrong" })).toBeInTheDocument();

    // Row is still visible with its data, but excluded from totals -> 0.00
    await waitFor(() =>
      expect(screen.getByTestId("period-total-my-eur")).toHaveTextContent("0")
    );
    expect(screen.getByDisplayValue("500")).toBeInTheDocument();
  });

  it("the Settings icon toggles open and closed on repeated taps", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");

    const settingsBtn = screen.getByRole("tab", { name: "Settings" });
    expect(settingsBtn).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute("aria-selected", "true");

    await user.click(settingsBtn);
    expect(settingsBtn).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("heading", { name: "Delete all data" })).toBeInTheDocument();

    // A second tap must close it again, back to Edit (where we started).
    await user.click(settingsBtn);
    expect(settingsBtn).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("heading", { name: "Delete all data" })).not.toBeInTheDocument();
  });

  it("closing Settings returns to Review if that's where the person was, not always Edit", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");

    await user.click(screen.getByRole("tab", { name: "Review" }));
    const settingsBtn = screen.getByRole("tab", { name: "Settings" });
    await user.click(settingsBtn);
    expect(settingsBtn).toHaveAttribute("aria-selected", "true");

    await user.click(settingsBtn);
    expect(screen.getByRole("tab", { name: "Review" })).toHaveAttribute("aria-selected", "true");
  });

  it("a newly created period starts collapsed, matching the old app", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Collapsed Test Group");

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));

    await user.click(screen.getByRole("button", { name: "+ New period" }));

    // The client table/fields must NOT be visible until expanded.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Add client" })).not.toBeInTheDocument();

    // Expanding it reveals the table.
    await expandFirstPeriod(user);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("the '+ Add period' button inside an expanded period adds another period to the same group", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Extra Cycle Group");

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);

    await user.click(screen.getByRole("button", { name: "+ Add period" }));

    const periods = await db.periods.toArray();
    expect(periods).toHaveLength(2);
    expect(periods[0].groupId).toBe(periods[1].groupId);
  });

  it("the client table stays a real scrollable table (not stacked cards) with all six columns always present", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Scroll Table Group");

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    await user.click(screen.getByRole("button", { name: "+ Add client" }));

    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual([
      "Customer",
      "Amount",
      "Expense",
      "City",
      "Done",
      "Actions",
    ]);
    // Headers must stay visible/present (not display:none, as a stacked
    // mobile layout would do) — getAllByRole already excludes hidden
    // elements, so finding all six here proves the header row is intact.
  });

  it("warns when a period's dates overlap another period in the same group, and only applies the change if confirmed", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Overlap Group");

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-01-31" } });

    const firstPeriodId = (await db.periods.toArray())[0].id;

    await user.click(screen.getByRole("button", { name: "+ Add period" }));
    const collapseButtons = screen.getAllByTestId("period-collapse-btn");
    await user.click(collapseButtons[1]);

    const fromInputs = screen.getAllByLabelText("From");
    const toInputs = screen.getAllByLabelText("To");

    // Set the second period's "To" first (no overlap check yet — "From" is
    // still empty, so the range isn't fully specified). Wait for the store
    // to actually reflect it before touching "From", so the overlap check
    // reads fresh state instead of a stale closure.
    fireEvent.change(toInputs[1], { target: { value: "2026-02-10" } });
    const secondPeriodId = (await waitFor(async () => {
      const all = await db.periods.toArray();
      const second = all.find((p) => p.id !== firstPeriodId && p.toDate === "2026-02-10");
      expect(second).toBeTruthy();
      return second!;
    })).id;

    // Overlapping range -> declined -> the change must NOT apply.
    mockModalConfirm(false);
    fireEvent.change(fromInputs[1], { target: { value: "2026-01-15" } });

    await waitFor(async () => {
      const p = await db.periods.get(secondPeriodId);
      expect(p?.fromDate).not.toBe("2026-01-15");
    });

    // Overlapping range -> confirmed -> the change DOES apply.
    mockModalConfirm(true);
    fireEvent.change(fromInputs[1], { target: { value: "2026-01-15" } });

    await waitFor(async () => {
      const p = await db.periods.get(secondPeriodId);
      expect(p?.fromDate).toBe("2026-01-15");
    });
  });

  it("asks for confirmation before deleting a client row even when it's still completely empty", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Empty Row Group");
    mockModalConfirm(false); // decline the very first time

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    await user.click(screen.getByRole("button", { name: "+ Add client" }));

    const table = screen.getByRole("table");
    // Row has no name/amount/expense/city/comment entered at all yet.
    await user.click(within(table).getByRole("button", { name: "Remove" }));

    // Declined -> the row must still be there.
    expect(within(table).getByRole("button", { name: "Remove" })).toBeInTheDocument();

    mockModalConfirm(true);
    await user.click(within(table).getByRole("button", { name: "Remove" }));

    // Confirmed -> the row is actually gone.
    expect(within(table).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("the '+ New Customer' FAB adds the client to the newest period (by date), not just the first one created", async () => {
    const user = userEvent.setup();
    mockModalPrompt("FAB Target Group");

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));

    // First period created, but dated OLDER.
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    const firstPeriodId = (await db.periods.toArray())[0].id;

    // Second period created LATER but dated NEWER — this is the one the
    // FAB should target, even though it wasn't created first.
    await user.click(screen.getByRole("button", { name: "+ Add period" }));
    const collapseButtons = screen.getAllByTestId("period-collapse-btn");
    await user.click(collapseButtons[1]);
    const fromInputs = screen.getAllByLabelText("From");
    fireEvent.change(fromInputs[1], { target: { value: "2026-06-01" } });
    const secondPeriodId = (await waitFor(async () => {
      const all = await db.periods.toArray();
      const second = all.find((p) => p.id !== firstPeriodId && p.fromDate === "2026-06-01");
      expect(second).toBeTruthy();
      return second!;
    })).id;

    await user.click(screen.getByRole("button", { name: "+ New Customer" }));

    await waitFor(async () => {
      const rows = await db.clientRows.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].periodId).toBe(secondPeriodId);
      expect(rows[0].periodId).not.toBe(firstPeriodId);
    });
  });

  it("periods are always listed in date order, regardless of which one was created first", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Sort Order Group");

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));

    // Create the LATER-dated period first...
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-06-01" } });
    await waitFor(async () => {
      expect((await db.periods.toArray())[0]?.fromDate).toBe("2026-06-01");
    });

    // ...then the EARLIER-dated one second.
    await user.click(screen.getByRole("button", { name: "+ Add period" }));
    const collapseButtons = screen.getAllByTestId("period-collapse-btn");
    await user.click(collapseButtons[1]);
    const fromInputs = screen.getAllByLabelText("From");
    fireEvent.change(fromInputs[1], { target: { value: "2026-01-01" } });

    await waitFor(() => {
      const headers = screen.getAllByTestId("period-collapse-btn");
      expect(headers[0]).toHaveTextContent("01/01/2026");
      expect(headers[1]).toHaveTextContent("01/06/2026");
    });
  });

  it("remembers the last Edit/Review mode across a full app reload — but never remembers Settings as a mode to reopen into", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await screen.findByText("Select group");

    await user.click(screen.getByRole("tab", { name: "Review" }));
    expect(localStorage.getItem("t1:last-mode")).toBe("review");

    unmount();
    render(<App />);
    await screen.findByText("Select group");
    expect(screen.getByRole("tab", { name: "Review" })).toHaveAttribute("aria-selected", "true");

    // Opening Settings must not overwrite the remembered content tab.
    await user.click(screen.getByLabelText("Settings"));
    expect(localStorage.getItem("t1:last-mode")).toBe("review");
  });

  it("client rows stay in the exact order they were typed in, even after a full app reload", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Order Group");

    const { unmount } = render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);

    // Add three clients in a specific order. Their ids are random UUIDs
    // (not sequential), so if anything ever re-fetched them sorted by id
    // instead of creation order, this order would come back scrambled.
    for (const name of ["Zeta", "Alpha", "Mike"]) {
      await user.click(screen.getByRole("button", { name: "+ Add client" }));
      const table = screen.getByRole("table");
      const inputs = within(table).getAllByPlaceholderText("Client name");
      await user.type(inputs[inputs.length - 1], name);
    }

    const namesBefore = within(screen.getByRole("table"))
      .getAllByPlaceholderText("Client name")
      .map((el) => (el as HTMLInputElement).value);
    expect(namesBefore).toEqual(["Zeta", "Alpha", "Mike"]);

    // Simulate a full app reload — re-fetches everything from IndexedDB
    // from scratch, exactly where the ordering bug would show up.
    unmount();
    render(<App />);
    // The group is already selected on reload (restored from IndexedDB),
    // so the switcher shows its name rather than the "Select group"
    // placeholder — wait for that instead (scoped to the switcher button
    // itself, since "Order Group" also appears in the period card's tag).
    await waitFor(() => {
      expect(screen.getByTestId("group-switcher-btn")).toHaveTextContent("Order Group");
    });
    await expandFirstPeriod(user);

    const namesAfter = within(screen.getByRole("table"))
      .getAllByPlaceholderText("Client name")
      .map((el) => (el as HTMLInputElement).value);
    expect(namesAfter).toEqual(["Zeta", "Alpha", "Mike"]);
  });

  it("the sort-clients checkbox reveals move up/down buttons for manually reordering rows, and the new order sticks after unchecking", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Sort Mode Group");

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);

    for (const name of ["First", "Second", "Third"]) {
      await user.click(screen.getByRole("button", { name: "+ Add client" }));
      const table = screen.getByRole("table");
      const inputs = within(table).getAllByPlaceholderText("Client name");
      await user.type(inputs[inputs.length - 1], name);
    }

    const table = screen.getByRole("table");
    const namesInitially = () =>
      within(table)
        .getAllByPlaceholderText("Client name")
        .map((el) => (el as HTMLInputElement).value);
    expect(namesInitially()).toEqual(["First", "Second", "Third"]);

    // No move buttons before the checkbox is checked.
    expect(screen.queryByLabelText("Move client up")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Sort clients" }));

    // First row can't move up, last row can't move down.
    const upButtons = screen.getAllByLabelText("Move client up");
    const downButtons = screen.getAllByLabelText("Move client down");
    expect(upButtons[0]).toBeDisabled();
    expect(downButtons[2]).toBeDisabled();

    // Move "Second" up above "First".
    await user.click(upButtons[1]);
    expect(namesInitially()).toEqual(["Second", "First", "Third"]);

    // Uncheck sort mode — buttons disappear, but the new order stays.
    await user.click(screen.getByRole("checkbox", { name: "Sort clients" }));
    expect(screen.queryByLabelText("Move client up")).not.toBeInTheDocument();
    expect(namesInitially()).toEqual(["Second", "First", "Third"]);
  });

  it("amounts are hidden (blurred) by default via a toggle next to the group switcher, and re-hide automatically the instant the app is backgrounded", async () => {
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Select group");

    // Hidden by default — the toggle button reflects that, and the root
    // app element carries the class the blur CSS hooks into.
    const toggle = screen.getByRole("button", { name: "Show amounts" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector(".amounts-hidden")).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Hide amounts" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(document.querySelector(".amounts-hidden")).not.toBeInTheDocument();

    // Simulate the app being backgrounded (task-switcher, phone lock,
    // switching to another app) — amounts must re-hide immediately, not
    // only on the next reload. This is what actually protects someone
    // who leaves the app "unlocked": a PWA on Android commonly resumes
    // the same still-running page instead of truly restarting it, so
    // relying only on the store's initial value wouldn't be enough.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    fireEvent(document, new Event("visibilitychange"));

    expect(screen.getByRole("button", { name: "Show amounts" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(document.querySelector(".amounts-hidden")).toBeInTheDocument();
  });

  it("the period that contains today's date gets a distinct highlighted header, others don't", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Today Highlight Group");

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));

    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const addDays = (base: Date, n: number) => {
      const copy = new Date(base);
      copy.setDate(copy.getDate() + n);
      return copy;
    };

    // Period spanning today.
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: iso(addDays(today, -3)) } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: iso(addDays(today, 3)) } });

    // A second period, well in the future, that does NOT include today.
    await user.click(screen.getByRole("button", { name: "+ Add period" }));
    const collapseButtons = screen.getAllByTestId("period-collapse-btn");
    await user.click(collapseButtons[1]);
    const fromInputs = screen.getAllByLabelText("From");
    const toInputs = screen.getAllByLabelText("To");
    fireEvent.change(fromInputs[1], { target: { value: iso(addDays(today, 30)) } });
    fireEvent.change(toInputs[1], { target: { value: iso(addDays(today, 37)) } });

    const headers = screen.getAllByTestId("period-collapse-btn");
    expect(headers[0].className).toMatch(/collapseBtnCurrent/);
    expect(headers[1].className).not.toMatch(/collapseBtnCurrent/);
  });

  it("a period inherits the group's current car number when created, keeps it independently afterward, and never gets changed retroactively", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Car Group");

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));

    // Only digits accepted, non-digit characters silently stripped.
    const carInput = screen.getByLabelText("Current car number");
    await user.type(carInput, "ab108cd");
    expect(carInput).toHaveValue("108");

    // First period — created while the group's current car is "108" —
    // inherits that automatically.
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    expect(screen.getByLabelText("Car Number")).toHaveValue("108");

    // The group's current car changes to "205" — the already-created
    // first period must NOT change retroactively.
    await user.clear(carInput);
    await user.type(carInput, "205");
    expect(screen.getByLabelText("Car Number")).toHaveValue("108");

    // A second period, created NOW, inherits the new current car "205".
    await user.click(screen.getByRole("button", { name: "+ Add period" }));
    const collapseButtons = screen.getAllByTestId("period-collapse-btn");
    await user.click(collapseButtons[1]);
    const carInputs = screen.getAllByLabelText("Car Number");
    expect(carInputs[0]).toHaveValue("108");
    expect(carInputs[1]).toHaveValue("205");

    // Editing the first period's car directly doesn't touch the second
    // period or the group's current value.
    await user.clear(carInputs[0]);
    await user.type(carInputs[0], "999");
    expect(carInputs[0]).toHaveValue("999");
    expect(carInputs[1]).toHaveValue("205");
    expect(carInput).toHaveValue("205");
  });

  it("the browser's native context menu (touch-and-hold copy popup) never opens on ordinary elements, but is NOT blocked inside text fields — otherwise pasting a copied link would be impossible", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Context Menu Group");

    render(<App />);
    await screen.findByText("Select group");

    const bodyEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(bodyEvent);
    expect(bodyEvent.defaultPrevented).toBe(true);

    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    await user.click(screen.getByRole("button", { name: "+ Add client" }));

    // A real text field — e.g. the City input, exactly where someone
    // would want to paste a copied Google Maps link. Its own native
    // Paste/Cut/Copy/Select-all menu (triggered by the same long-press
    // gesture on a touch keyboard) must still work.
    const cityInput = within(screen.getByRole("table")).getByPlaceholderText("City");
    const inputEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    cityInput.dispatchEvent(inputEvent);
    expect(inputEvent.defaultPrevented).toBe(false);
  });

  it("the visit-date panel (calendar icon) only shows once something is set, stays closed by default, and setting days doesn't require a date or vice versa", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Visit Panel Group");

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    await user.click(screen.getByRole("button", { name: "+ Add client" }));

    const table = screen.getByRole("table");
    await user.type(within(table).getByPlaceholderText("Client name"), "Panel Client");

    const calendarBtn = screen.getByRole("button", { name: "Set visit date and days" });
    // Not "filled" yet — plain styling, panel closed, no date input or
    // day buttons visible until opened.
    expect(calendarBtn.className).not.toMatch(/visitBtnSet/);
    expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();

    await user.click(calendarBtn);
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    const dayButtons = screen.getAllByRole("button").filter((b) => /^[1-5]$/.test(b.textContent ?? ""));
    expect(dayButtons).toHaveLength(5);

    // Set only the day count, no date — perfectly valid on its own.
    await user.click(dayButtons[2]); // "3"
    await user.click(screen.getByRole("button", { name: "Done" }));

    // Panel closed; icon now shows as "set".
    expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();
    expect(calendarBtn.className).toMatch(/visitBtnSet/);

    // Reopen and now also set a date.
    await user.click(calendarBtn);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-15" } });
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(calendarBtn.className).toMatch(/visitBtnSet/);
  });

  it("the startup splash (CT logo + spinner) is tied to real `loaded` state, fades out, and is fully removed once the app has settled", async () => {
    render(<App />);
    await screen.findByText("Select group");

    // The splash fades out (CSS class change) as soon as loaded becomes
    // true — this happens well before "Select group" renders, since
    // both depend on the same loaded flag — and is fully removed from
    // the DOM shortly after (not lingering, and never blocking
    // interaction via the fade's pointer-events: none in the meantime).
    await waitFor(
      () => {
        expect(screen.queryByTestId("app-splash")).not.toBeInTheDocument();
      },
      { timeout: 1000 }
    );

    // The real app content is fully usable afterward — not stuck behind
    // a leftover overlay.
    expect(screen.getByTestId("group-switcher-btn")).toBeInTheDocument();
  });
});
