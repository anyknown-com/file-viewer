import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blobSource } from "../contract/byte-source";
import type { SaveHandler } from "../contract/save";
import { FileViewer } from "./file-viewer";

afterEach(cleanup);

describe("FileViewer with .md", () => {
  it("renders markdown and offers no Edit button", async () => {
    render(
      <FileViewer
        file={{ name: "doc.md", source: blobSource(new Blob(["# Hi"])) }}
        onSave={vi.fn<SaveHandler>()}
      />,
    );
    await screen.findByRole("heading", { name: "Hi" });
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
});
