import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesSource, type ByteSource, type FileRef } from "../contract/byte-source";
import { ViewerError } from "../contract/errors";
import { ViewerRoot } from "../primitives/root";
import CompPreview from "./comp-preview";
import { imageMessages } from "./messages";
import { compZipWithPreview, maxEnd, recordingSource } from "./test/comp-zip";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount(file: FileRef, fail = vi.fn<(e: ViewerError) => void>()) {
  const view = render(
    <ViewerRoot>
      <CompPreview file={file} fail={fail} />
    </ViewerRoot>,
  );
  return { ...view, fail };
}

describe("CompPreview", () => {
  it("shows the preview from the head only and revokes its url on unmount", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const zip = await compZipWithPreview();
    const source = recordingSource(zip);
    const { container, unmount } = mount({ name: "x.comp.zip", source });
    await waitFor(() => expect(container.querySelector("img")).toBeTruthy());
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("blob:preview");
    expect(img.alt).toBe("x.comp.zip");
    expect(maxEnd(source)).toBeLessThan(zip.length);
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:preview");
  });

  it("says there is no preview for a zip written by Finder", async () => {
    const zip = new Uint8Array(readFileSync("src/comp/fixtures/ditto-project.comp.zip"));
    mount({ name: "d.comp.zip", source: bytesSource(zip) });
    expect(await screen.findByText(imageMessages.en["image.preview.none"])).toBeTruthy();
  });

  it("passes read errors to fail", async () => {
    const source: ByteSource = {
      size: 100,
      read: () => Promise.reject(new ViewerError("read_failed")),
    };
    const { fail } = mount({ name: "x.comp.zip", source });
    await waitFor(() => expect(fail).toHaveBeenCalledOnce());
    expect(fail.mock.calls[0]![0].code).toBe("read_failed");
  });
});
