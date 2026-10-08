import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import diagram from "../../test/fixtures/diagram.excalidraw?raw";
import { blobSource } from "../contract/byte-source";
import { ViewerRoot } from "../primitives/root";
import type { BodyProps } from "./bodies";
import ExcalidrawBody from "./excalidraw-body";

vi.mock("../excalidraw/diagram-image", () => ({ default: () => <img alt="mock" /> }));

afterEach(cleanup);

describe("ExcalidrawBody", () => {
  it("shows the file as one diagram", async () => {
    const file = { name: "diagram.excalidraw", source: blobSource(new Blob([diagram])) };
    const props: BodyProps = {
      file,
      loaded: { blob: new Blob([diagram]), url: null, text: diagram },
      fail: vi.fn<BodyProps["fail"]>(),
      viewer: { file },
    };
    const { container } = render(
      <ViewerRoot>
        <ExcalidrawBody {...props} />
      </ViewerRoot>,
    );
    await screen.findByAltText("mock");
    expect(container.querySelector(".fv-excalidraw .fv-diagram")).not.toBeNull();
  });
});
