import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS } from "./limits";
import { editKindOf, kindOf, mimeOf } from "./kinds";

const Mi = 1024 * 1024;
const Gi = 1024 * Mi;
const f = (name: string, size = 1, mime = "") => ({ name, size, mime });

describe("kindOf view", () => {
  it("prefers extension, falls back to mime", () => {
    expect(kindOf(f("photo.JPG")).view).toBe("image");
    expect(mimeOf(f("photo.JPG"))).toBe("image/jpeg");
    expect(kindOf(f("a.bin", 1, "image/png")).view).toBe("image");
    expect(kindOf(f("a.png", 1, "application/octet-stream")).view).toBe("image");
    expect(mimeOf(f("a.png", 1, "application/octet-stream"))).toBe("image/png");
    expect(kindOf(f("x", 1, "text/markdown")).view).toBe("markdown");
  });

  it("handles svg and gif", () => {
    expect(kindOf(f("x.svg")).view).toBe("image");
    expect(mimeOf(f("x.svg"))).toBe("image/svg+xml");
    expect(editKindOf(f("x.svg"), DEFAULT_LIMITS)).toBeNull();
    expect(kindOf(f("x.gif")).view).toBe("image");
    expect(editKindOf(f("x.gif"), DEFAULT_LIMITS)).toBeNull();
  });

  it("rejects unsupported image mimes", () => {
    const r = kindOf(f("photo.heic", 1, "image/heic"));
    expect(r.view).toBeNull();
    expect(r.tooLarge).toBe(false);
  });

  it("treats webm as video unless mime is audio/webm", () => {
    expect(kindOf(f("clip.webm")).view).toBe("video");
    expect(kindOf(f("clip.webm", 1, "audio/webm")).view).toBe("audio");
    expect(mimeOf(f("clip.webm", 1, "audio/webm"))).toBe("audio/webm");
    expect(kindOf(f("song.mp3")).view).toBe("audio");
    expect(kindOf(f("a.oga")).view).toBe("audio");
  });

  it("classifies pdf, markdown, text, excalidraw", () => {
    expect(kindOf(f("doc.pdf")).view).toBe("pdf");
    expect(kindOf(f("notes.md", 2 * Mi)).view).toBe("markdown");
    expect(kindOf(f("data.json")).view).toBe("text");
    expect(kindOf(f("script", 1, "text/x-python; charset=utf-8")).view).toBe("text");
    expect(kindOf(f("scene.excalidraw")).view).toBe("excalidraw");
  });

  it("reports tooLarge per kind", () => {
    expect(kindOf(f("notes.md", 9 * Mi))).toMatchObject({ view: null, tooLarge: true, edit: null });
    expect(kindOf(f("readme.txt", 2 * Mi))).toMatchObject({ view: null, tooLarge: true });
    expect(kindOf(f("movie.mp4", 3 * Gi))).toMatchObject({
      view: null,
      tooLarge: true,
      edit: "video",
    });
    expect(kindOf({ name: "a.png", size: 11 }, { previewBytes: 10 }).tooLarge).toBe(true);
  });

  it("returns null view for unknown formats and comp.zip", () => {
    expect(kindOf(f("p.COMP.ZIP", 10 * Mi))).toMatchObject({ view: null, tooLarge: false });
    expect(mimeOf(f("p.COMP.ZIP"))).toBe("application/zip");
    for (const file of [f("a.zip"), f("noext")]) {
      expect(kindOf(file)).toMatchObject({ view: null, tooLarge: false });
      expect(mimeOf(file)).toBe("application/octet-stream");
    }
  });
});

describe("editKindOf", () => {
  it("follows the edit rules", () => {
    expect(editKindOf(f("notes.md", 2 * Mi), DEFAULT_LIMITS)).toBe("markdown");
    expect(editKindOf(f("scene.excalidraw"), DEFAULT_LIMITS)).toBe("excalidraw");
    expect(editKindOf(f("p.COMP.ZIP", 10 * Mi), DEFAULT_LIMITS)).toBe("image");
    expect(editKindOf(f("p.COMP.ZIP", 2 * Gi), DEFAULT_LIMITS)).toBeNull();
    expect(editKindOf(f("big.png", 65 * Mi), DEFAULT_LIMITS)).toBeNull();
    expect(editKindOf(f("a.png"), { ...DEFAULT_LIMITS, previewBytes: 0 })).toBeNull();
    expect(editKindOf(f("movie.mp4", 3 * Gi), DEFAULT_LIMITS)).toBe("video");
  });
});
