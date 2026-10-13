import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateServiceWorker = vi.fn();
const setNeedRefresh = vi.fn();
const setOfflineReady = vi.fn();

let needRefresh = false;
let offlineReady = false;

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  }),
}));

import { UpdatePrompt } from "./UpdatePrompt";

describe("UpdatePrompt", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    needRefresh = false;
    offlineReady = false;
  });

  it("renders nothing when there's no update and offline-readiness hasn't been announced", () => {
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a visible 'new version available' banner when needRefresh is true", async () => {
    needRefresh = true;
    render(<UpdatePrompt />);

    expect(screen.getByText(/new version is available/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("lets the user dismiss the update banner without updating", async () => {
    needRefresh = true;
    render(<UpdatePrompt />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Later" }));
    expect(setNeedRefresh).toHaveBeenCalledWith(false);
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it("shows an offline-ready message when the app has been cached for offline use", () => {
    offlineReady = true;
    render(<UpdatePrompt />);
    expect(screen.getByText(/ready for offline use/)).toBeInTheDocument();
  });

  it("prioritizes the update banner over the offline-ready message if both are true", () => {
    needRefresh = true;
    offlineReady = true;
    render(<UpdatePrompt />);
    expect(screen.getByText(/new version is available/)).toBeInTheDocument();
    expect(screen.queryByText(/ready for offline use/)).not.toBeInTheDocument();
  });
});
