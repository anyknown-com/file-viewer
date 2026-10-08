import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ViewerError } from "../contract/errors";
import { ViewerRoot } from "../primitives/root";
import { imageMessages } from "./messages";
import { createUiSlot, UiOutlet, type UiSlot } from "./ui-slot";

afterEach(cleanup);

function mount(slot: UiSlot, onError = vi.fn<(e: ViewerError) => void>()) {
  const view = render(
    <ViewerRoot locale="zh-TW" onError={onError}>
      <UiOutlet slot={slot} />
    </ViewerRoot>,
  );
  return { ...view, onError };
}

it("renders opened nodes inside .fv-ie-ui until closed", () => {
  const slot = createUiSlot();
  const { container } = mount(slot);
  let close: (() => void) | undefined;
  act(() => {
    close = slot.open((done) => <button onClick={done}>dialog body</button>);
  });
  expect(container.querySelector(".fv-ie-ui")?.textContent).toBe("dialog body");
  act(() => close?.());
  expect(screen.queryByText("dialog body")).toBeNull();
  expect(() => act(() => close?.())).not.toThrow();
});

it("sends errors raised before mount once, after mount", () => {
  const slot = createUiSlot();
  const error = new ViewerError("too_large");
  slot.error(error);
  expect(slot.notice()).toEqual({ key: "error.too_large", vars: undefined });
  const { onError } = mount(slot);
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenCalledWith(error);
  slot.dismiss();
  expect(slot.notice()).toBeNull();
});

it("reports errors after mount and keeps the given key", () => {
  const slot = createUiSlot();
  const { onError } = mount(slot);
  slot.error(new ViewerError("save_failed"), "image.notice.unsupported", { n: 1 });
  expect(onError).toHaveBeenCalledTimes(1);
  expect(slot.notice()).toEqual({ key: "image.notice.unsupported", vars: { n: 1 } });
});

it("translates with the mounted locale", () => {
  const slot = createUiSlot();
  expect(slot.t("image.notice.unsupported")).toBe(imageMessages.en["image.notice.unsupported"]);
  const { unmount } = mount(slot);
  expect(slot.t("image.notice.unsupported")).toBe(
    imageMessages["zh-TW"]["image.notice.unsupported"],
  );
  unmount();
  expect(slot.t("image.notice.unsupported")).toBe(imageMessages.en["image.notice.unsupported"]);
});
