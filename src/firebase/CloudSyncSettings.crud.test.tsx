import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { CloudSyncSettings } from "./CloudSyncSettings";
import { useAppStore } from "../app/store";
import { resetAppForTest } from "../test/resetAppForTest";

describe("Cloud Sync settings — sign-in form", () => {
  beforeEach(async () => {
    await resetAppForTest();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a sign-in form (never a blocking gate) when nobody is signed in yet", async () => {
    const user = userEvent.setup();
    render(<App />);

    // The app itself is immediately usable — Cloud Sync is opt-in, not a
    // gate blocking the rest of the app.
    await screen.findByText("Select group");

    await user.click(screen.getByRole("tab", { name: "Settings" }));

    expect(screen.getByRole("heading", { name: "Cloud Sync" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows a validation message instead of attempting a sign-in with empty fields", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");
    await user.click(screen.getByRole("tab", { name: "Settings" }));

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Enter both email and password/);
  });
});

describe("Cloud Sync settings — signed-in view", () => {
  beforeEach(async () => {
    await resetAppForTest();
    // Simulate an already-signed-in device — a real Firebase sign-in isn't
    // possible in this test environment, so the store is set directly,
    // exactly as onAuthStateChanged would have done.
    useAppStore.setState({ cloudUserEmail: "person@example.com" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("Save/Load are on one row with cloud icons, and a Data & Backup details button lives at the bottom", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");
    await user.click(screen.getByRole("tab", { name: "Settings" }));

    const saveBtn = screen.getByRole("button", { name: "☁️ Save to cloud now" });
    const loadBtn = screen.getByRole("button", { name: "☁️ Load from cloud" });
    expect(saveBtn).toBeInTheDocument();
    expect(loadBtn).toBeInTheDocument();
    // Same parent row, not wrapped onto separate lines.
    expect(saveBtn.parentElement).toBe(loadBtn.parentElement);

    const detailsBtn = screen.getByRole("button", { name: "💾 Data & Backup details" });
    expect(detailsBtn).toBeInTheDocument();

    // Save/Load share one color; Data & Backup details has its own,
    // distinct from them.
    expect(saveBtn.className).toBe(loadBtn.className);
    expect(detailsBtn.className).not.toBe(saveBtn.className);
  });

  it("the Data & Backup details button opens a stats panel with active/archive breakdown and backup status", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");
    await user.click(screen.getByRole("tab", { name: "Settings" }));

    await user.click(screen.getByRole("button", { name: "💾 Data & Backup details" }));

    expect(screen.getByText("💾 Data & Backup")).toBeInTheDocument();
    expect(screen.getByText("No backups yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("💾 Data & Backup")).not.toBeInTheDocument();
  });

  it("a conflict shows 'Save Cloud'/'Restore Cloud' on one row with cloud icons, plus Data & Backup details", async () => {
    const user = userEvent.setup();
    useAppStore.setState({
      cloudConflict: {
        local: {
          dataUpdatedAt: "2026-08-01T10:00:00.000Z",
          groups: [],
          periods: [],
          clientRows: [],
          settings: useAppStore.getState().settings,
        },
        cloud: {
          dataUpdatedAt: "2026-08-01T10:00:00.000Z",
          groups: [],
          periods: [],
          clientRows: [],
          settings: useAppStore.getState().settings,
        },
      },
    });

    render(<App />);
    await screen.findByText("Select group");
    await user.click(screen.getByRole("tab", { name: "Settings" }));

    const saveBtn = screen.getByRole("button", { name: "☁️ Save Cloud" });
    const restoreBtn = screen.getByRole("button", { name: "☁️ Restore Cloud" });
    expect(saveBtn).toBeInTheDocument();
    expect(restoreBtn).toBeInTheDocument();
    expect(saveBtn.parentElement).toBe(restoreBtn.parentElement); // same row
    expect(saveBtn.className).toBe(restoreBtn.className); // same color as each other

    const detailsBtn = screen.getByRole("button", { name: "💾 Data & Backup details" });
    expect(detailsBtn).toBeInTheDocument();
    expect(detailsBtn.className).not.toBe(saveBtn.className); // its own distinct color
  });

  it("Data & Backup details shows a conflict as a clear warning, not the same green as a healthy sync", async () => {
    const user = userEvent.setup();
    act(() => {
      useAppStore.setState({
        cloudUserEmail: "person@example.com",
        cloudStatus: "local",
        // A stale timestamp from an earlier, unrelated successful sync —
        // the conflict must still take priority over showing this.
        cloudLastSyncedAt: "2026-08-01T09:00:00.000Z",
      });
    });

    render(<App />);
    await screen.findByText("Select group");
    await user.click(screen.getByRole("tab", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "💾 Data & Backup details" }));

    const cloudSyncValue = screen.getByText("Conflict — action needed");
    expect(cloudSyncValue).toBeInTheDocument();
    // Must NOT be styled the same "safe"/green way a real synced state is.
    expect(cloudSyncValue.className).not.toMatch(/safe/i);
  });

  it("shows a 'Synced - HH:MM:SS' timestamp once a sync has actually completed", async () => {
    // Rendered directly (not <App/>) to avoid App's startCloudSync() auth
    // subscription racing with this test's manually-mocked signed-in state.
    act(() => {
      useAppStore.setState({ cloudUserEmail: "person@example.com" });
    });
    render(<CloudSyncSettings />);

    act(() => {
      useAppStore.getState().markCloudSynced();
    });

    expect(await screen.findByText(/^Synced - \d{1,2}:\d{2}:\d{2}/)).toBeInTheDocument();
  });

  it("shows a 'Sign out' button once signed in, which calls signOutOfCloud", async () => {
    const user = userEvent.setup();
    const authModule = await import("./auth");
    const signOutSpy = vi.spyOn(authModule, "signOutOfCloud").mockResolvedValue(undefined);

    act(() => {
      useAppStore.setState({ cloudUserEmail: "person@example.com" });
    });
    render(<CloudSyncSettings />);

    const signOutBtn = screen.getByRole("button", { name: "Sign out" });
    expect(signOutBtn).toBeInTheDocument();
    await user.click(signOutBtn);

    expect(signOutSpy).toHaveBeenCalledTimes(1);
    signOutSpy.mockRestore();
  });
});
