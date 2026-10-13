import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { db } from "../../db/database";
import { resetAppForTest, openGroupMenu, expandFirstPeriod, mockModalPrompt, mockModalConfirm, getModalOpenCount, resetModalOpenCount } from "../../test/resetAppForTest";

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: /Settings/ }));
  await screen.findByRole("heading", { name: "Delete all data" });
}

describe("Settings — defaults, currency display, destructive-action confirmation, clear data", () => {
  beforeEach(async () => {
    await resetAppForTest();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses the configured default rate/salary for newly created groups", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");
    await openSettings(user);

    const rateInput = screen.getByLabelText("Default rate %");
    await user.clear(rateInput);
    await user.type(rateInput, "22.5");

    const salaryInput = screen.getByLabelText("Default salary / 28 days");
    await user.clear(salaryInput);
    await user.type(salaryInput, "500");

    await waitFor(async () => {
      const stored = await db.settings.get("app");
      expect(stored?.defaultRate).toBe(22.5);
      expect(stored?.defaultSalary).toBe(500);
    });

    // Go back to Edit and create a group — it should pick up the new defaults.
    await user.click(screen.getByRole("tab", { name: "Edit" }));
    mockModalPrompt("New Defaults Group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));

    await waitFor(async () => {
      const groups = await db.groups.toArray();
      expect(groups).toHaveLength(1);
      expect(groups[0].defaultRate).toBe(22.5);
      expect(groups[0].defaultSalary).toBe(500);
    });
  });

  it("changing the currency display symbol never touches stored numeric values", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Currency Group");

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await screen.findByRole("button", { name: "+ New period" });
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    await screen.findByRole("button", { name: "+ Add client" });
    await user.click(screen.getByRole("button", { name: "+ Add client" }));

    const table = screen.getByRole("table");
    await user.type(within(table).getAllByPlaceholderText("0")[0], "1234");

    await openSettings(user);
    const currencySelect = screen.getByLabelText("Currency symbol");
    await user.selectOptions(currencySelect, "$");

    await waitFor(async () => {
      const stored = await db.settings.get("app");
      expect(stored?.currencySymbol).toBe("$");
    });

    // The Overview KPI should now show the new symbol as a prefix — it
    // starts collapsed by default now, so open it first.
    await user.click(screen.getByRole("tab", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: /Overview/ }));
    await waitFor(() => {
      expect(screen.getByText("$1234")).toBeInTheDocument();
    });

    // The underlying stored Gross value must be completely unchanged.
    const rows = await db.clientRows.toArray();
    expect(rows[0].gross).toBe("1234");
  });

  it("skips the confirmation dialog for destructive actions when the setting is turned off", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Group To Delete");

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await screen.findByRole("button", { name: /Group To Delete/ });

    await openSettings(user);
    await user.click(screen.getByLabelText(/Confirm destructive actions/));

    resetModalOpenCount();
    await user.click(screen.getByRole("tab", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(getModalOpenCount()).toBe(0);
    await waitFor(async () => {
      expect(await db.groups.count()).toBe(0);
    });
  });

  it("still confirms destructive actions by default (setting left on)", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Group Kept");
    mockModalConfirm(false); // decline

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await screen.findByRole("button", { name: /Group Kept/ });

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(getModalOpenCount()).toBeGreaterThan(0);
    expect(await db.groups.count()).toBe(1); // declined -> still there
  });

  it("requires typing the exact confirmation phrase before 'clear all data' is enabled", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Group X");

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await screen.findByRole("button", { name: /Group X/ });

    await openSettings(user);
    const clearBtn = screen.getByRole("button", { name: "Delete all data" });
    expect(clearBtn).toBeDisabled();

    const confirmInput = screen.getByPlaceholderText("DELETE");
    await user.type(confirmInput, "wrong phrase");
    expect(clearBtn).toBeDisabled();

    await user.clear(confirmInput);
    await user.type(confirmInput, "DELETE");
    expect(clearBtn).toBeEnabled();

    await user.click(clearBtn);

    await waitFor(async () => {
      expect(await db.groups.count()).toBe(0);
    });
    expect(screen.getByText("All data deleted.")).toBeInTheDocument();
  });
});
