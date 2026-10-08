import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import diagram from "../../test/fixtures/diagram.excalidraw?raw";
import { blobSource } from "../contract/byte-source";
import { FileViewer } from "./file-viewer";

vi.mock("../excalidraw/diagram-image", () => ({ default: () => <img alt="mock" /> }));

afterEach(cleanup);

describe("FileViewer with .excalidraw", () => {
  it("shows the diagram body", async () => {
    const { container } = render(
      <FileViewer file={{ name: "diagram.excalidraw", source: blobSource(new Blob([diagram])) }} />,
    );
    await waitFor(() => expect(container.querySelector(".fv-excalidraw")).not.toBeNull());
  });
});
