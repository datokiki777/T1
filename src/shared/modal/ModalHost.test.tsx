import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModalHost } from "./ModalHost";
import { confirmDialog, promptDialog, useModalStore } from "./modalStore";

describe("confirmDialog / ModalHost", () => {
  afterEach(() => {
    cleanup();
    useModalStore.setState({ request: null });
  });

  it("renders nothing when there's no pending request", () => {
    const { container } = render(<ModalHost />);
    expect(container).toBeEmptyDOMElement();
  });

  it("resolves true when Yes/confirm is clicked, and shows Cancel on the left, confirm on the right", async () => {
    const user = userEvent.setup();
    render(<ModalHost />);

    const resultPromise = confirmDialog("Delete this client?");
    expect(await screen.findByText("Delete this client?")).toBeInTheDocument();

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Cancel");
    expect(buttons[1]).toHaveTextContent("Yes");

    await user.click(screen.getByRole("button", { name: "Yes" }));
    expect(await resultPromise).toBe(true);
    expect(screen.queryByText("Delete this client?")).not.toBeInTheDocument();
  });

  it("resolves false when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<ModalHost />);

    const resultPromise = confirmDialog("Remove period?");
    await screen.findByText("Remove period?");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await resultPromise).toBe(false);
  });

  it("resolves false on Escape", async () => {
    render(<ModalHost />);

    const resultPromise = confirmDialog("Are you sure?");
    await screen.findByText("Are you sure?");
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });

    expect(await resultPromise).toBe(false);
  });

  it("supports custom confirm/cancel labels", async () => {
    const user = userEvent.setup();
    render(<ModalHost />);

    const resultPromise = confirmDialog("Overwrite cloud data?", {
      confirmLabel: "Overwrite",
      cancelLabel: "Keep both",
    });
    await screen.findByText("Overwrite cloud data?");
    expect(screen.getByRole("button", { name: "Overwrite" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep both" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Overwrite" }));
    expect(await resultPromise).toBe(true);
  });

  it("promptDialog resolves the entered text, or null on cancel", async () => {
    const user = userEvent.setup();
    render(<ModalHost />);

    const resultPromise = promptDialog("Group name:", "Old Name");
    const input = await screen.findByLabelText("Group name:");
    expect(input).toHaveValue("Old Name");

    await user.clear(input);
    await user.type(input, "New Group Name");
    await user.click(screen.getByRole("button", { name: "OK" }));

    expect(await resultPromise).toBe("New Group Name");
  });

  it("promptDialog resolves null when cancelled", async () => {
    const user = userEvent.setup();
    render(<ModalHost />);

    const resultPromise = promptDialog("New name:");
    await screen.findByLabelText("New name:");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await resultPromise).toBeNull();
  });

  it("promptDialog submits on Enter", async () => {
    const user = userEvent.setup();
    render(<ModalHost />);

    const resultPromise = promptDialog("PIN:");
    const input = await screen.findByLabelText("PIN:");
    await user.type(input, "482913{Enter}");

    expect(await resultPromise).toBe("482913");
  });
});
