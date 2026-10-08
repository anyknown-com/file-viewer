import type * as Package from "@anyknown/file-viewer";
import type { FileViewerProps } from "@anyknown/file-viewer";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type * as host from "./host";
import { downloadSave } from "./host";
import { Playground } from "./playground";

vi.mock("@anyknown/file-viewer", async () => {
  const actual = await vi.importActual<typeof Package>("@anyknown/file-viewer");
  return {
    blobSource: actual.blobSource,
    FileViewer: (props: FileViewerProps) => (
      <div>
        <p>viewing {props.file.name}</p>
        <button type="button" onClick={() => props.onDirtyChange?.(true)}>
          make dirty
        </button>
        <button
          type="button"
          onClick={() =>
            void props.onSave?.({
              blob: new Blob(["x"]),
              mime: "text/plain",
              ext: ".txt",
              mode: "replace",
              suggestedName: "a.txt",
            })
          }
        >
          save
        </button>
      </div>
    ),
  };
});

vi.mock("./host", async (importOriginal) => ({
  ...(await importOriginal<typeof host>()),
  downloadSave: vi.fn<typeof host.downloadSave>(() => Promise.resolve()),
}));

function input(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>("[data-playground-input]")!;
}

it("asks before discarding unsaved changes", async () => {
  const user = userEvent.setup();
  const { container } = render(<Playground locale="en" />);
  await user.upload(input(container), new File(["1"], "first.txt"));
  await user.click(screen.getByRole("button", { name: "make dirty" }));

  await user.upload(input(container), new File(["2"], "second.txt"));
  expect(await screen.findByText("Discard your changes?")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByText("viewing first.txt")).toBeTruthy();

  await user.upload(input(container), new File(["2"], "second.txt"));
  await user.click(await screen.findByRole("button", { name: "Discard" }));
  expect(screen.getByText("viewing second.txt")).toBeTruthy();
});

it("downloads a save and shows the saved file on replace", async () => {
  const user = userEvent.setup();
  const { container } = render(<Playground locale="en" />);
  await user.upload(input(container), new File(["1"], "first.txt"));
  await user.click(screen.getByRole("button", { name: "save" }));
  expect(downloadSave).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("a.txt")).toBeTruthy();
});
