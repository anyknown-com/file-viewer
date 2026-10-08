import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { Playground } from "./playground";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

it("opens a sample with the same open as a picked file", async () => {
  const text = readFileSync(join(process.cwd(), "site/public/samples/notes.txt"), "utf8");
  const fetch = vi.fn<(url: string) => Promise<{ blob: () => Promise<Blob> }>>(async () => ({
    blob: async () => new Blob([text]),
  }));
  vi.stubGlobal("fetch", fetch);
  const user = userEvent.setup();
  const { container } = render(<Playground locale="en" />);
  await user.click(container.querySelector<HTMLButtonElement>('[data-sample="notes.txt"]')!);
  expect(
    await screen.findByText(/Nothing is uploaded; the bytes stay on your device\./),
  ).toBeTruthy();
  expect(fetch).toHaveBeenCalledWith("/samples/notes.txt");
});
