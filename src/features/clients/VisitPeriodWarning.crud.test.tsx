import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { useAppStore } from "../../app/store";
import {
  resetAppForTest,
  openGroupMenu,
  expandFirstPeriod,
  mockModalPrompt,
  mockModalConfirm,
  getModalOpenCount,
  resetModalOpenCount,
} from "../../test/resetAppForTest";

async function setupClientInPeriod(user: ReturnType<typeof userEvent.setup>) {
  mockModalPrompt("Visit Group");
  render(<App />);
  await screen.findByText("Select group");
  await openGroupMenu();
  await user.click(screen.getByRole("button", { name: "+ Group" }));
  await user.click(screen.getByRole("button", { name: "+ New period" }));
  await expandFirstPeriod(user);
  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
  fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-01-07" } });
  await user.click(screen.getByRole("button", { name: "+ Add client" }));
  await user.click(screen.getByRole("button", { name: "Set visit date and days" }));
}

describe("client days vs. period dates", () => {
  beforeEach(async () => {
    await resetAppForTest();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("stays silent when the client's days fit inside the period", async () => {
    const user = userEvent.setup();
    await setupClientInPeriod(user);
    resetModalOpenCount();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-01-03" } });
    await user.click(screen.getByRole("button", { name: "Set number of days" }));
    await user.click(screen.getByRole("button", { name: "3" })); // Jan 3-5, inside Jan 1-7

    expect(getModalOpenCount()).toBe(0);
    expect(useAppStore.getState().highlightedPeriodId).toBeNull();
  });

  it("warns when the days run past the period; 'Edit period' flashes the period dates", async () => {
    const user = userEvent.setup();
    await setupClientInPeriod(user);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-01-06" } });

    resetModalOpenCount();
    mockModalConfirm(true); // "Edit period"
    await user.click(screen.getByRole("button", { name: "Set number of days" }));
    await user.click(screen.getByRole("button", { name: "3" })); // Jan 6-8 > period end Jan 7

    expect(getModalOpenCount()).toBe(1);
    const periodId = useAppStore.getState().periods[0].id;
    await waitFor(() => expect(useAppStore.getState().highlightedPeriodId).toBe(periodId));
    // The visit panel closes so the period dates are in view.
    await waitFor(() => expect(screen.queryByLabelText("Date")).not.toBeInTheDocument());
  });

  it("'Keep as is' leaves everything alone — no flash, value stays saved", async () => {
    const user = userEvent.setup();
    await setupClientInPeriod(user);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-01-06" } });

    mockModalConfirm(false); // "Keep as is"
    await user.click(screen.getByRole("button", { name: "Set number of days" }));
    await user.click(screen.getByRole("button", { name: "3" }));

    expect(useAppStore.getState().highlightedPeriodId).toBeNull();
    expect(useAppStore.getState().clientRows[0].visitDays).toBe(3);
  });
});
