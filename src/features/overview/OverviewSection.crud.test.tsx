import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { resetAppForTest, openGroupMenu, expandFirstPeriod, mockModalPrompt } from "../../test/resetAppForTest";

describe("Overview page — matches the old app's business logic", () => {
  beforeEach(async () => {
    await resetAppForTest();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("KPI cards (Gross/Net/My€/Unpaid/Income) update automatically as data changes", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Overview Group");

    render(<App />);
    await screen.findByText("Select group");

    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    await user.click(screen.getByRole("button", { name: "+ Add client" }));

    const overviewCard = screen.getByText("📊 Overview").closest("section")!;
    // Overview starts collapsed by default now — open it.
    await user.click(within(overviewCard).getByRole("button", { name: /Overview/ }));

    // Initially everything is zero.
    expect(within(overviewCard).getAllByText("€0").length).toBeGreaterThan(0);

    const table = screen.getByRole("table");
    const grossInput = within(table).getAllByPlaceholderText("0")[0];
    await user.type(grossInput, "1000");

    // Default group rate is 13.5%, Net not entered -> Gross is the My€ base,
    // and the same row is "Unpaid" (Gross entered, Net not entered).
    await waitFor(() => {
      const grossKpi = within(overviewCard).getByText("Gross").parentElement!;
      expect(grossKpi).toHaveTextContent("1000");
    });

    await waitFor(() => {
      const unpaidPill = within(overviewCard).getByText("Unpaid").parentElement!;
      expect(unpaidPill).toHaveTextContent("135"); // 1000 * 13.5%
    });

    // No salary configured for this group (default 0) -> income == unpaid.
    await waitFor(() => {
      const incomePill = within(overviewCard).getByText("Income").parentElement!;
      expect(incomePill).toHaveTextContent("135");
    });

    // Status badges update automatically when a row's status changes.
    const statusBtn = within(table).getByRole("button", { name: "—" });
    await user.click(statusBtn); // -> done
    await waitFor(() => {
      const statusRow = within(overviewCard).getByText(/Done \/ Fail/).parentElement!;
      expect(within(statusRow).getAllByText("1")[0]).toBeInTheDocument();
    });
  });

  it("configuring a group salary reduces Income relative to Unpaid", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Salary Group");

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));

    // Set a default salary of 400/28days -> 100/week.
    const salaryInput = screen.getByLabelText("Default salary / 28d");
    await user.clear(salaryInput);
    await user.type(salaryInput, "400");

    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);

    // A 1-week period with paidWeeks = 0 -> full week of salary owed.
    const fromInput = screen.getByLabelText("From");
    const toInput = screen.getByLabelText("To");
    await user.type(fromInput, "2026-01-01");
    await user.type(toInput, "2026-01-07");

    await user.click(screen.getByRole("button", { name: "+ Add client" }));
    const table = screen.getByRole("table");
    const grossInput = within(table).getAllByPlaceholderText("0")[0];
    await user.type(grossInput, "1000"); // unpaid = 1000 * 13.5% = 135

    const overviewCard = screen.getByText("📊 Overview").closest("section")!;
    // Overview starts collapsed by default now — open it.
    await user.click(within(overviewCard).getByRole("button", { name: /Overview/ }));

    await waitFor(() => {
      const unpaidPill = within(overviewCard).getByText("Unpaid").parentElement!;
      expect(unpaidPill).toHaveTextContent("135");
    });

    // salary owed = 100 (1 week * 100/week, 0 paid weeks) -> income = 135 - 100 = 35
    await waitFor(() => {
      const incomePill = within(overviewCard).getByText("Income").parentElement!;
      expect(incomePill).toHaveTextContent("35");
    });
  });

  it("clicking a status badge shows a scrollable list of matching clients, and clicking one jumps to it in Edit mode immediately (no long-press needed here)", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Status Drilldown Group");

    render(<App />);
    await screen.findByText("Select group");

    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    await user.click(screen.getByRole("button", { name: "+ Add client" }));

    const table = screen.getByRole("table");
    await user.type(within(table).getByPlaceholderText("Client name"), "Drilldown Client");

    // Cycle the row's status to "done".
    const statusBtn = within(table).getByRole("button", { name: "—" });
    await user.click(statusBtn);

    // Switch to Review — so navigating to Edit afterward is unambiguous
    // proof the click actually fired the navigation, not just "was
    // already there".
    await user.click(screen.getByRole("tab", { name: "Review" }));

    const overviewCard = screen.getByText("📊 Overview").closest("section")!;
    // Overview starts collapsed by default now — open it.
    await user.click(within(overviewCard).getByRole("button", { name: /Overview/ }));

    // No client list until a badge is clicked.
    expect(within(overviewCard).queryByRole("list")).not.toBeInTheDocument();

    const doneBadge = await within(overviewCard).findByRole("button", { name: "1" });
    await user.click(doneBadge);

    const list = within(overviewCard).getByRole("list", { name: "Done clients" });
    expect(within(list).getByText("Drilldown Client")).toBeInTheDocument();

    // Clicking the badge again hides the list (toggle).
    await user.click(doneBadge);
    expect(within(overviewCard).queryByRole("list")).not.toBeInTheDocument();

    // Reopen and click the client — a plain tap jumps to Edit mode and
    // highlights it immediately, same as before.
    await user.click(doneBadge);
    await user.click(within(overviewCard).getByText("Drilldown Client"));

    expect(await screen.findByRole("tab", { name: "Edit", selected: true })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Drilldown Client")).toBeInTheDocument();
  });

  it("the Comments widget breaks down by status (like Done/Fail/Fixed/Wrong), counting only clients with a comment, and clicking one jumps to it in Edit mode", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Comments Group");

    render(<App />);
    await screen.findByText("Select group");

    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);

    // First client — has a comment AND is marked Done.
    await user.click(screen.getByRole("button", { name: "+ Add client" }));
    let table = screen.getByRole("table");
    let rows = within(table).getAllByPlaceholderText("Client name");
    await user.type(rows[rows.length - 1], "Noted Client");
    await user.click(within(table).getAllByRole("button", { name: /Add note|Saved/ })[0]);
    await user.type(screen.getByPlaceholderText("Private note for this client..."), "Call back Monday");
    await user.click(within(table).getByRole("button", { name: "—" })); // none -> done

    // Second client — also Done, but left with no comment at all.
    await user.click(screen.getByRole("button", { name: "+ Add client" }));
    table = screen.getByRole("table");
    rows = within(table).getAllByPlaceholderText("Client name");
    await user.type(rows[rows.length - 1], "Silent Client");
    await user.click(within(table).getByRole("button", { name: "—" }));

    // Switch to Review — so navigating to Edit afterward is unambiguous
    // proof the long-press actually fired, not just "was already there".
    await user.click(screen.getByRole("tab", { name: "Review" }));

    const overviewCard = screen.getByText("📊 Overview").closest("section")!;
    await user.click(within(overviewCard).getByRole("button", { name: /Overview/ }));

    // "Comments" row, same shape as Done/Fail/Fixed/Wrong: 4 status-colored
    // badges. Only the ONE Done client with an actual comment is counted
    // under the green (Done) badge — the commentless Done client doesn't
    // bump it, and Fail/Fixed/Wrong all stay at 0.
    const commentsLabel = within(overviewCard).getByText("📝 Comments");
    const commentsRow = commentsLabel.closest("div")!;
    const [doneBadge, failBadge, fixedBadge, wrongBadge] = within(commentsRow).getAllByRole("button");
    expect(doneBadge).toHaveTextContent("1");
    expect(failBadge).toHaveTextContent("0");
    expect(fixedBadge).toHaveTextContent("0");
    expect(wrongBadge).toHaveTextContent("0");

    expect(within(overviewCard).queryByRole("list")).not.toBeInTheDocument();
    await user.click(doneBadge);

    const list = within(overviewCard).getByRole("list", { name: "Done clients with comments" });
    expect(within(list).getByText("Noted Client")).toBeInTheDocument();
    expect(within(list).getByText("Call back Monday")).toBeInTheDocument();
    expect(within(list).queryByText("Silent Client")).not.toBeInTheDocument();

    // Toggle closed.
    await user.click(doneBadge);
    expect(within(overviewCard).queryByRole("list")).not.toBeInTheDocument();

    // Reopen and click the client — a plain tap jumps to Edit mode and
    // highlights it immediately, same as before.
    await user.click(doneBadge);
    await user.click(within(overviewCard).getByText("Noted Client"));

    expect(await screen.findByRole("tab", { name: "Edit", selected: true })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Noted Client")).toBeInTheDocument();
  });

  it("the Comments count respects Current vs All scope, counting only the active group unless All is selected", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Group A");

    render(<App />);
    await screen.findByText("Select group");

    // Group A: one Done client with a comment.
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    await user.click(screen.getByRole("button", { name: "+ Add client" }));
    let table = screen.getByRole("table");
    await user.type(within(table).getByPlaceholderText("Client name"), "A Client");
    await user.click(within(table).getByRole("button", { name: /Add note|Saved/ }));
    await user.type(screen.getByPlaceholderText("Private note for this client..."), "note A");
    await user.click(within(table).getByRole("button", { name: "—" }));

    // Group B: a different Done client, also with a comment. (The group
    // menu is already open from creating Group A — it doesn't auto-close.)
    mockModalPrompt("Group B");
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    await user.click(screen.getByRole("button", { name: "+ Add client" }));
    table = screen.getByRole("table");
    await user.type(within(table).getByPlaceholderText("Client name"), "B Client");
    await user.click(within(table).getByRole("button", { name: /Add note|Saved/ }));
    await user.type(screen.getByPlaceholderText("Private note for this client..."), "note B");
    await user.click(within(table).getByRole("button", { name: "—" }));

    // Now viewing Group B (the active one) — "Current" scope must show
    // only Group B's one commented client, not Group A's.
    const overviewCard = screen.getByText("📊 Overview").closest("section")!;
    await user.click(within(overviewCard).getByRole("button", { name: /Overview/ }));

    const commentsLabel = within(overviewCard).getByText("📝 Comments");
    const commentsRow = commentsLabel.closest("div")!;
    const [doneBadge] = within(commentsRow).getAllByRole("button");
    expect(doneBadge).toHaveTextContent("1");

    // Switching to "All" must count both groups' commented clients together.
    await user.click(within(overviewCard).getByRole("button", { name: "All" }));
    expect(doneBadge).toHaveTextContent("2");
  });

  it("Working period and Monthly Statistics only reflect the current group on Current scope, and every group on All scope", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Older Group");

    render(<App />);
    await screen.findByText("Select group");

    // Group with an OLDER period (Jan 2026).
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-01-08" } });

    // Second group, now active, with a NEWER period (June 2026).
    mockModalPrompt("Newer Group");
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-06-08" } });

    const overviewCard = screen.getByText("📊 Overview").closest("section")!;
    await user.click(within(overviewCard).getByRole("button", { name: /Overview/ }));

    // Current (active group = "Newer Group") -> only June's range, and
    // Monthly Statistics should default to June, not January.
    expect(within(overviewCard).getByText("01/06/2026 → 08/06/2026")).toBeInTheDocument();
    expect(within(overviewCard).getByText("June 2026")).toBeInTheDocument();

    // All -> spans both groups, January through June.
    await user.click(within(overviewCard).getByRole("button", { name: "All" }));
    expect(within(overviewCard).getByText("01/01/2026 → 08/06/2026")).toBeInTheDocument();
  });

  it("Working period respects Current/All scope in the Archive workspace exactly the same way as Active", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Archived Older");

    render(<App />);
    await screen.findByText("Select group");

    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-02-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-02-08" } });
    await user.click(screen.getByLabelText("Archive / Restore"));

    mockModalPrompt("Archived Newer");
    await user.click(screen.getByRole("button", { name: "+ Group" }));
    await user.click(screen.getByRole("button", { name: "+ New period" }));
    await expandFirstPeriod(user);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-09-08" } });
    await user.click(screen.getByLabelText("Archive / Restore"));

    await user.click(screen.getByRole("tab", { name: "Archive" }));
    const overviewCard = screen.getByText("📊 Overview").closest("section")!;
    await user.click(within(overviewCard).getByRole("button", { name: /Overview/ }));

    // Current (active archived group = "Archived Newer") -> only that
    // group's range.
    expect(within(overviewCard).getByText("01/09/2026 → 08/09/2026")).toBeInTheDocument();

    // All -> spans both archived groups.
    await user.click(within(overviewCard).getByRole("button", { name: "All" }));
    expect(within(overviewCard).getByText("01/02/2026 → 08/09/2026")).toBeInTheDocument();
  });
});
