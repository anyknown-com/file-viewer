import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog, DiscardDialog, Dialog } from "./dialog";
import { ViewerRoot } from "./root";

afterEach(cleanup);

describe("Dialog", () => {
  it("renders in the portal and closes on Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn<(o: boolean) => void>();
    render(
      <ViewerRoot>
        <Dialog open onOpenChange={onOpenChange} title="Hello">
          body
        </Dialog>
      </ViewerRoot>,
    );
    const d = await screen.findByRole("dialog", { name: "Hello" });
    expect(d.closest(".fv-portal")).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("ConfirmDialog", () => {
  function setup() {
    const calls: string[] = [];
    const onConfirm = vi.fn<() => void>(() => calls.push("confirm"));
    const onOpenChange = vi.fn<(o: boolean) => void>((o) => calls.push(`open:${o}`));
    render(
      <ViewerRoot>
        <ConfirmDialog
          open
          onOpenChange={onOpenChange}
          title="Sure?"
          description="desc"
          confirmLabel="Yes"
          cancelLabel="No"
          onConfirm={onConfirm}
        />
      </ViewerRoot>,
    );
    return { calls, onConfirm, onOpenChange, user: userEvent.setup() };
  }

  it("confirms then closes", async () => {
    const { calls, user } = setup();
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Yes" }));
    expect(calls).toEqual(["confirm", "open:false"]);
  });

  it("only closes on cancel", async () => {
    const { calls, onConfirm, user } = setup();
    await user.click(await screen.findByRole("button", { name: "No" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(calls).toEqual(["open:false"]);
  });
});

describe("DiscardDialog", () => {
  it("shows zh-TW strings and discards", async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn<() => void>();
    render(
      <ViewerRoot locale="zh-TW">
        <DiscardDialog open onOpenChange={() => {}} onDiscard={onDiscard} />
      </ViewerRoot>,
    );
    expect(await screen.findByText("要放棄修改嗎？")).toBeTruthy();
    expect(screen.getByRole("button", { name: "繼續編輯" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "放棄修改" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
