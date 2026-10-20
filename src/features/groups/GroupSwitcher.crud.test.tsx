import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { db } from "../../db/database";
import { resetAppForTest, openGroupMenu, expandFirstPeriod, mockModalPrompt } from "../../test/resetAppForTest";
import { GROUP_SWITCHER_LONG_PRESS_MS } from "./GroupSwitcher";

async function addGroupViaMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  mockModalPrompt(name);
  if (!screen.queryByRole("button", { name: "+ Group" })) {
    await openGroupMenu();
  }
  await user.click(screen.getByRole("button", { name: "+ Group" }));
  await screen.findByTestId("group-switcher-btn");
}

describe("GroupSwitcher — tap cycles groups, long-press opens the management menu", () => {
  beforeEach(async () => {
    await resetAppForTest();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("a short tap cycles to the next group, wrapping back to the first", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");

    await addGroupViaMenu(user, "Group One");
    await addGroupViaMenu(user, "Group Two");
    await addGroupViaMenu(user, "Group Three");

    const switcherBtn = screen.getByTestId("group-switcher-btn");
    // Newly created groups become active immediately, so we're on "Group Three".
    expect(switcherBtn).toHaveTextContent("Group Three");

    await user.click(switcherBtn);
    expect(switcherBtn).toHaveTextContent("Group One"); // wraps around

    await user.click(switcherBtn);
    expect(switcherBtn).toHaveTextContent("Group Two");

    await user.click(switcherBtn);
    expect(switcherBtn).toHaveTextContent("Group Three"); // wrapped fully
  });

  it("a short tap does nothing when there are no groups yet", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");

    const switcherBtn = screen.getByTestId("group-switcher-btn");
    await user.click(switcherBtn);
    expect(switcherBtn).toHaveTextContent("Select group");
  });

  it("long-pressing opens a management menu with group actions and salary field", async () => {
    render(<App />);
    await screen.findByText("Select group");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await openGroupMenu();

    const menu = screen.getByRole("menu");
    expect(screen.getByRole("button", { name: "+ Group" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive / Restore" })).toBeInTheDocument();
    expect(screen.getByLabelText("Salary / month")).toBeInTheDocument();
    expect(menu).toBeInTheDocument();
  });

  it("long-pressing again closes the menu", async () => {
    render(<App />);
    await screen.findByText("Select group");

    await openGroupMenu();
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await openGroupMenu();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("releasing before the long-press threshold does NOT open the menu (it's a real long-press, not just any hold)", async () => {
    render(<App />);
    await screen.findByText("Select group");

    const switcherBtn = screen.getByTestId("group-switcher-btn");
    await act(async () => {
      fireEvent.pointerDown(switcherBtn);
      await new Promise((r) => setTimeout(r, GROUP_SWITCHER_LONG_PRESS_MS - 200));
      fireEvent.pointerUp(switcherBtn);
    });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("releasing a long-press does not also trigger the tap-to-cycle action", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");

    await addGroupViaMenu(user, "Only Group");
    // The menu is left open by addGroupViaMenu's long-press; close it with
    // another long-press and confirm the group did NOT also get cycled
    // (there's only one group, so this specifically checks no double-fire
    // crashed anything and the active group is still correct).
    await openGroupMenu();

    const switcherBtn = screen.getByTestId("group-switcher-btn");
    expect(switcherBtn).toHaveTextContent("Only Group");
  });

  it("the menu's actions (rename) still work exactly as before, just inside the collapsible panel", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");

    await addGroupViaMenu(user, "Original Name");

    mockModalPrompt("Renamed Group");
    await user.click(screen.getByRole("button", { name: "Rename" }));

    const switcherBtn = await screen.findByTestId("group-switcher-btn");
    expect(switcherBtn).toHaveTextContent("Renamed Group");
  });

  it("switching Active <-> Archive restores the group last selected on that tab (instead of showing zeros)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");

    await addGroupViaMenu(user, "Active One");
    const switcherBtn = screen.getByTestId("group-switcher-btn");
    expect(switcherBtn).toHaveTextContent("Active One");

    // Archive it, then create a brand new active group.
    await user.click(screen.getByRole("button", { name: "Archive / Restore" }));
    await user.click(screen.getByRole("tab", { name: "Active" }));
    await addGroupViaMenu(user, "Active Two");
    expect(switcherBtn).toHaveTextContent("Active Two");

    // Switch to Archive: must land on "Active One" (now archived), not on
    // whatever was active before, and not show a blank/zeroed selection.
    await user.click(screen.getByRole("tab", { name: "Archive" }));
    expect(switcherBtn).toHaveTextContent("Active One");

    // Switch back to Active: must restore "Active Two" automatically.
    await user.click(screen.getByRole("tab", { name: "Active" }));
    expect(switcherBtn).toHaveTextContent("Active Two");
  });

  it("group management controls (add/rename/archive/delete, default salary) are disabled in Review mode", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");

    await addGroupViaMenu(user, "Manageable In Edit");
    const switcherBtn = screen.getByTestId("group-switcher-btn");
    // Menu is left open by addGroupViaMenu's long-press.
    expect(screen.getByRole("button", { name: "+ Group" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Rename" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Archive / Restore" })).toBeEnabled();
    expect(screen.getByLabelText("Salary / month")).toBeEnabled();

    await user.click(screen.getByRole("tab", { name: "Review" }));

    expect(screen.getByRole("button", { name: "+ Group" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rename" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archive / Restore" })).toBeDisabled();
    expect(screen.getByLabelText("Salary / month")).toBeDisabled();

    // But tap-to-cycle (browsing groups) must still work in Review mode:
    // close the (still-open, now-disabled) menu with another long-press,
    // add a second group back in Edit mode, then confirm cycling works
    // once we're back in Review.
    await openGroupMenu();
    await user.click(screen.getByRole("tab", { name: "Edit" }));
    await addGroupViaMenu(user, "Second Group");
    await user.click(screen.getByRole("tab", { name: "Review" }));

    await user.click(switcherBtn);
    expect(switcherBtn).toHaveTextContent("Manageable In Edit");
  });

  it("clearing the salary mid-edit and typing again never leaves a stray leading zero", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");
    await addGroupViaMenu(user, "Clear And Retype Group");

    const salaryInput = screen.getByLabelText("Salary / month");

    // Delete everything down to empty, THEN type — not just tap-in-and-type.
    await user.clear(salaryInput);
    await user.type(salaryInput, "3500");
    expect(salaryInput).toHaveValue("3500");

    // And the underlying numeric values are correct too, not "013"/"03500".
    const group = (await db.groups.toArray())[0];
    expect(group.defaultSalary).toBe(3500);
  });

  it("shows the group's current car number on the switcher button itself, and nothing extra when it's unset", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");
    await addGroupViaMenu(user, "Car Switcher Group");

    const switcherBtn = screen.getByTestId("group-switcher-btn");

    // No car number set yet — no car tag shown at all.
    expect(switcherBtn).not.toHaveTextContent("🚗");

    await user.type(screen.getByLabelText("Current car number"), "108");
    expect(switcherBtn).toHaveTextContent("Car Switcher Group");
    expect(switcherBtn).toHaveTextContent("🚗 108");
  });
});
describe("GroupSwitcher — group picker modal", () => {
  beforeEach(async () => {
    await resetAppForTest();
  });

  afterEach(() => {
    cleanup();
  });

  it("in Edit mode, long-press opens the usual settings menu (not the picker); its new 'Switch group' button opens the picker, which lists groups with the active one highlighted", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");
    await addGroupViaMenu(user, "Alpha");
    await addGroupViaMenu(user, "Beta");

    // Menu is already open from addGroupViaMenu above — still the
    // settings menu, not the picker — "+ Group"/"Rename" etc.
    // are present, confirming the long-press behavior in Edit is
    // unchanged.
    expect(screen.getByRole("button", { name: "+ Group" })).toBeInTheDocument();
    expect(screen.queryByText(/Switch group \(/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch group" }));
    const pickerCard = screen.getByText("Switch group (Active)").closest('[class*="pickerCard"]') as HTMLElement;

    const alphaOption = within(pickerCard).getByRole("button", { name: /Alpha/ });
    const betaOption = within(pickerCard).getByRole("button", { name: /Beta/ });
    // "Beta" was added last, so it's the active group — styled as such.
    expect(betaOption.className).toMatch(/pickerItemActive/);
    expect(alphaOption.className).not.toMatch(/pickerItemActive/);

    await user.click(alphaOption);
    expect(screen.queryByText("Switch group (Active)")).not.toBeInTheDocument();
    expect(screen.getByTestId("group-switcher-btn")).toHaveTextContent("Alpha");
  });

  it("in Review mode, long-press opens the group picker directly (not the faded settings menu)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");
    await addGroupViaMenu(user, "Review Picker Group");
    await addGroupViaMenu(user, "Second Group");
    await openGroupMenu(); // close the menu left open by addGroupViaMenu

    await user.click(screen.getByRole("tab", { name: "Review" }));
    await openGroupMenu();

    expect(screen.getByText("Switch group (Active)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Group" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Review Picker Group/ }));
    expect(screen.queryByText("Switch group (Active)")).not.toBeInTheDocument();
    expect(screen.getByTestId("group-switcher-btn")).toHaveTextContent("Review Picker Group");
  });

  it("only lists groups in the current workspace (Active vs Archive), and Cancel/tapping outside closes without changing anything", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");
    await addGroupViaMenu(user, "Still Active Group");
    await addGroupViaMenu(user, "Soon Archived Group");

    // Archive "Soon Archived Group" (it's the current active one).
    // Menu is already open from the addGroupViaMenu calls above.
    await user.click(screen.getByRole("button", { name: "Archive / Restore" }));

    await addGroupViaMenu(user, "Still Active Group 2");
    // Menu is already open from addGroupViaMenu above.
    await user.click(screen.getByRole("button", { name: "Switch group" }));

    const activeList = screen.getByText("Switch group (Active)").closest('[class*="pickerCard"]') as HTMLElement;
    expect(within(activeList).getByText("Still Active Group")).toBeInTheDocument();
    expect(within(activeList).getByText("Still Active Group 2")).toBeInTheDocument();
    expect(within(activeList).queryByText("Soon Archived Group")).not.toBeInTheDocument();

    // Cancel closes without switching.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("group-switcher-btn")).toHaveTextContent("Still Active Group 2");

    // Reopen (opening the picker from the settings menu closes that menu
    // too, so a fresh long-press is needed to get back to "Switch group"),
    // then tap the overlay outside the card — also closes, no switch.
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "Switch group" }));
    const overlay = screen.getByText("Switch group (Active)").closest('[class*="pickerOverlay"]') as HTMLElement;
    await user.click(overlay);
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.getByTestId("group-switcher-btn")).toHaveTextContent("Still Active Group 2");
  });

  it("orders groups by their latest period's date — most recent first, oldest last; groups with no periods sort to the bottom", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");

    async function addGroupWithPeriod(name: string, from: string, to: string) {
      await addGroupViaMenu(user, name);
      await openGroupMenu(); // close the menu addGroupViaMenu left open
      await user.click(screen.getByRole("button", { name: "+ New period" }));
      await expandFirstPeriod(user);
      fireEvent.change(screen.getByLabelText("From"), { target: { value: from } });
      fireEvent.change(screen.getByLabelText("To"), { target: { value: to } });
    }

    await addGroupWithPeriod("March Group", "2026-03-01", "2026-03-07");
    await addGroupWithPeriod("January Group", "2026-01-01", "2026-01-07");
    await addGroupWithPeriod("June Group", "2026-06-01", "2026-06-07");
    await addGroupViaMenu(user, "No Periods Group"); // never gets a period
    // Menu is already open from addGroupViaMenu above.
    await user.click(screen.getByRole("button", { name: "Switch group" }));

    const pickerCard = screen.getByText("Switch group (Active)").closest('[class*="pickerCard"]') as HTMLElement;
    const names = within(pickerCard)
      .getAllByRole("button")
      .map((b) => b.textContent)
      .filter((t): t is string => t !== "Cancel" && t !== null);

    expect(names).toEqual(["June Group", "March Group", "January Group", "No Periods Group"]);
  }, 30000);

  it("the group list renders every group even when there are many — nothing is silently capped/hidden, so there's actually something to scroll through", async () => {
    // jsdom doesn't compute real layout or load the actual CSS rules, so
    // the scroll/max-height behavior itself (verified by hand via the
    // .pickerCard/.pickerList CSS and a visual check) can't be asserted
    // here — this covers the part that is testable: every group makes
    // it into the list, none dropped.
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");

    for (let i = 1; i <= 15; i++) {
      await addGroupViaMenu(user, `Group ${i}`);
      await openGroupMenu(); // close the menu left open
    }

    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "Switch group" }));

    const pickerCard = screen.getByText("Switch group (Active)").closest('[class*="pickerCard"]') as HTMLElement;
    for (let i = 1; i <= 15; i++) {
      expect(within(pickerCard).getByText(`Group ${i}`)).toBeInTheDocument();
    }
  }, 45000);
});
