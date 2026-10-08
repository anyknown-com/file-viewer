import type { SaveRequest } from "@anyknown/file-viewer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { downloadSave, fileRefOf, savedRefOf } from "./host";

const req: SaveRequest = {
  blob: new Blob(["edited"]),
  mime: "text/plain",
  ext: ".txt",
  mode: "copy",
  suggestedName: "notes (edited).txt",
};

beforeEach(() => {
  vi.useFakeTimers();
  URL.createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => "blob:stub");
  URL.revokeObjectURL = vi.fn<(url: string) => void>();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("downloads the save under its suggested name and revokes the URL a minute later", async () => {
  const clicked: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
  await downloadSave(req);
  expect(clicked).toHaveLength(1);
  const a = clicked[0]!;
  expect(a.download).toBe("notes (edited).txt");
  expect(a.getAttribute("href")).toBe("blob:stub");
  expect(a.isConnected).toBe(false);
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60_000);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:stub");
});

it("leaves mime undefined when the file has no type", () => {
  expect(fileRefOf(new File(["x"], "x.bin")).mime).toBeUndefined();
});

it("reads a saved ref from the saved blob", () => {
  expect(savedRefOf(req).source.size).toBe(req.blob.size);
  expect(savedRefOf(req).name).toBe("notes (edited).txt");
});
