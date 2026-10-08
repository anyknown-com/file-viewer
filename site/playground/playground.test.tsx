import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { Playground } from "./playground";

function input(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>("[data-playground-input]")!;
}

it("opens a chosen file and closes back to the empty state", async () => {
  const user = userEvent.setup();
  const { container } = render(<Playground locale="en" />);
  await user.upload(input(container), new File(["hello"], "notes.txt", { type: "text/plain" }));
  expect(await screen.findByText("hello")).toBeTruthy();
  expect(screen.getByText("notes.txt")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByText("Drop a file to open it")).toBeTruthy();
});

it("speaks zh-TW when the locale is zh-TW", () => {
  render(<Playground locale="zh-TW" />);
  expect(screen.getByText("把檔案拖進來打開")).toBeTruthy();
});

it("opens a file dropped on the drop area", async () => {
  const { container } = render(<Playground locale="en" />);
  const file = new File(["dropped text"], "drop.txt", { type: "text/plain" });
  fireEvent.drop(container.querySelector(".pg-drop")!, { dataTransfer: { files: [file] } });
  expect(await screen.findByText("dropped text")).toBeTruthy();
});
