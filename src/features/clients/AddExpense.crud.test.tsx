import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { useAppStore } from "../../app/store";
import {
  resetAppForTest,
  openGroupMenu,
  expandFirstPeriod,
  mockModalPrompt,
} from "../../test/resetAppForTest";

function expenseInRow() {
  return useAppStore.getState().clientRows[0].expense;
}

describe("+ button next to Expense", () => {
  beforeEach(async () => {
    await resetAppForTest();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  async function setup(user: ReturnType<typeof userEvent.setup>) {
    mockModalPrompt("Expense Group");
    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    await user.click(screen.getByRole("button", { name: "+ Add client" }));
    const table = screen.getByRole("table");
    const expenseInput = within(table).getAllByPlaceholderText("0")[1];
    await user.type(expenseInput, "100");
    return expenseInput;
  }

  it("adds each amount on top of the current expense (100 + 36 + 45)", async () => {
    const user = userEvent.setup();
    const expenseInput = await setup(user);
    expect(expenseInput).toHaveValue("100");

    mockModalPrompt("36");
    await user.click(screen.getByRole("button", { name: "Add to expense" }));
    await waitFor(() => expect(expenseInput).toHaveValue("136"));

    mockModalPrompt("45");
    await user.click(screen.getByRole("button", { name: "Add to expense" }));
    await waitFor(() => expect(expenseInput).toHaveValue("181"));
    expect(expenseInRow()).toBe("181");
  });

  it("starts from 0 when the expense is empty", async () => {
    const user = userEvent.setup();
    const expenseInput = await setup(user);
    await user.clear(expenseInput);

    mockModalPrompt("25");
    await user.click(screen.getByRole("button", { name: "Add to expense" }));
    await waitFor(() => expect(expenseInput).toHaveValue("25"));
  });

  it("ignores cancel, empty, zero, negative and non-numeric answers", async () => {
    const user = userEvent.setup();
    const expenseInput = await setup(user);

    for (const answer of [null, "", "0", "-5", "abc"]) {
      mockModalPrompt(answer);
      await user.click(screen.getByRole("button", { name: "Add to expense" }));
    }
    expect(expenseInput).toHaveValue("100");
    expect(screen.queryByRole("button", { name: "Undo last expense add" })).not.toBeInTheDocument();
  });

  it("Undo restores the value from before the last add; typing by hand hides Undo", async () => {
    const user = userEvent.setup();
    const expenseInput = await setup(user);

    mockModalPrompt("36");
    await user.click(screen.getByRole("button", { name: "Add to expense" }));
    await waitFor(() => expect(expenseInput).toHaveValue("136"));

    await user.click(screen.getByRole("button", { name: "Undo last expense add" }));
    expect(expenseInput).toHaveValue("100");
    expect(screen.queryByRole("button", { name: "Undo last expense add" })).not.toBeInTheDocument();

    mockModalPrompt("10");
    await user.click(screen.getByRole("button", { name: "Add to expense" }));
    await waitFor(() => expect(expenseInput).toHaveValue("110"));
    await user.type(expenseInput, "5");
    expect(screen.queryByRole("button", { name: "Undo last expense add" })).not.toBeInTheDocument();
  });
});
