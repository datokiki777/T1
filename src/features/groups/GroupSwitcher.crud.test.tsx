import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { db } from "../../db/database";
import { resetAppForTest, openGroupMenu, mockModalPrompt } from "../../test/resetAppForTest";
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

  it("long-pressing opens a management menu with group actions and default-rate/salary fields", async () => {
    render(<App />);
    await screen.findByText("Select group");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await openGroupMenu();

    const menu = screen.getByRole("menu");
    expect(screen.getByRole("button", { name: "+ Group" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive / Restore" })).toBeInTheDocument();
    expect(screen.getByLabelText("Default %")).toBeInTheDocument();
    expect(screen.getByLabelText("Default salary / 28d")).toBeInTheDocument();
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

  it("group management controls (add/rename/archive/delete, default rate/salary) are disabled in Review mode", async () => {
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
    expect(screen.getByLabelText("Default %")).toBeEnabled();
    expect(screen.getByLabelText("Default salary / 28d")).toBeEnabled();

    await user.click(screen.getByRole("tab", { name: "Review" }));

    expect(screen.getByRole("button", { name: "+ Group" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rename" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archive / Restore" })).toBeDisabled();
    expect(screen.getByLabelText("Default %")).toBeDisabled();
    expect(screen.getByLabelText("Default salary / 28d")).toBeDisabled();

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

  it("clearing Default % or salary mid-edit and typing again never leaves a stray leading zero", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");
    await addGroupViaMenu(user, "Clear And Retype Group");

    const rateInput = screen.getByLabelText("Default %");
    const salaryInput = screen.getByLabelText("Default salary / 28d");

    // Delete everything down to empty, THEN type — not just tap-in-and-type.
    await user.clear(rateInput);
    await user.type(rateInput, "13.5");
    expect(rateInput).toHaveValue("13.5");

    await user.clear(salaryInput);
    await user.type(salaryInput, "3500");
    expect(salaryInput).toHaveValue("3500");

    // And the underlying numeric values are correct too, not "013"/"03500".
    const group = (await db.groups.toArray())[0];
    expect(group.defaultRate).toBe(13.5);
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
