import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FileViewer } from "../viewer/file-viewer";
import { compZipWithPreview, maxEnd, recordingSource } from "./test/comp-zip";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("FileViewer shows a comp project's preview without reading to the end", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const zip = await compZipWithPreview();
  const source = recordingSource(zip);
  const { container } = render(<FileViewer file={{ name: "x.comp.zip", source }} />);
  await waitFor(() => expect(container.querySelector("img")).toBeTruthy());
  expect(maxEnd(source)).toBeLessThan(zip.length);
});
