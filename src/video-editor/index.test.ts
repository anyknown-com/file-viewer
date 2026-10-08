import { describe, expect, it } from "vitest";
import { editors } from "../viewer/editors";
import { VideoEditor } from "./index";

describe("./video-editor entry", () => {
  it("exports VideoEditor and registers it for video", () => {
    expect(VideoEditor).toBeTypeOf("function");
    expect(editors.video).toBeTruthy();
  });
});
