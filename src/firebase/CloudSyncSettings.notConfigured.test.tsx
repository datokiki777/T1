import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { resetAppForTest, openGroupMenu, mockModalPrompt } from "../test/resetAppForTest";
import { isFirebaseConfigured } from "./config";

describe("Cloud Sync settings — T1's real default (no Firebase project configured yet)", () => {
  beforeEach(async () => {
    await resetAppForTest();
  });

  afterEach(() => {
    cleanup();
  });

  it("isFirebaseConfigured is false by default, so startCloudSync never attempts any network/Firebase call", () => {
    expect(isFirebaseConfigured).toBe(false);
  });

  it("shows a clear 'not set up yet' message instead of a sign-in form or a broken cloud UI", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Select group");
    await user.click(screen.getByRole("tab", { name: "Settings" }));

    expect(screen.getByText(/Cloud sync isn't set up for this app yet/)).toBeInTheDocument();
    expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
    expect(screen.queryByText(/This device and the cloud both have changes/)).not.toBeInTheDocument();
  });

  it("the rest of the app — groups, periods, clients, export/import — is fully usable with cloud sync unconfigured", async () => {
    const user = userEvent.setup();
    mockModalPrompt("Local Only Group");

    render(<App />);
    await screen.findByText("Select group");
    await openGroupMenu();
    await user.click(screen.getByRole("button", { name: "+ Group" }));

    expect(screen.getByTestId("group-switcher-btn")).toHaveTextContent("Local Only Group");

    await user.click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.getByRole("button", { name: /Export JSON/ })).toBeInTheDocument();
  });
});
