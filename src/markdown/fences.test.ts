import { describe, expect, it } from "vitest";
import { findFences, maskFences, replaceFence } from "./fences";

const doc = (json: string, open = "```excalidraw", close = "```") => `${open}\n${json}\n${close}`;

describe("findFences", () => {
  it("returns [] without fences", () => {
    expect(findFences("# hi\n\ntext\n")).toEqual([]);
  });

  it("indexes fences in order", () => {
    const f = findFences(`a\n\n${doc("{1}")}\n\nb\n\n${doc("{2}")}\n`);
    expect(f.map((x) => [x.index, x.json])).toEqual([
      [0, "{1}"],
      [1, "{2}"],
    ]);
  });

  it("finds fences inside lists and quotes", () => {
    const src = "- item\n\n  ```excalidraw\n  {a}\n  ```\n\n> ```excalidraw\n> {b}\n> ```\n";
    expect(findFences(src).map((x) => x.json)).toEqual(["{a}", "{b}"]);
  });

  it("handles ~~~, four backticks and info strings", () => {
    expect(findFences(doc("{t}", "~~~excalidraw", "~~~"))[0]?.json).toBe("{t}");
    expect(findFences(doc("{q}", "````excalidraw", "````"))[0]?.json).toBe("{q}");
    expect(findFences(doc("{i}", "```excalidraw title"))[0]?.json).toBe("{i}");
  });

  it("ignores other languages", () => {
    expect(findFences(doc("{}", "```json"))).toEqual([]);
  });
});

describe("replaceFence", () => {
  it("replaces only the content", () => {
    const src = `before\n\n${doc("{old}")}\n\nafter\n`;
    const [f] = findFences(src);
    const out = replaceFence(src, f!, "{new}");
    expect(out).toBe(`before\n\n${doc("{new}")}\n\nafter\n`);
  });

  it("keeps list indentation and quote prefixes", () => {
    const src = "- item\n\n  ```excalidraw\n  {a}\n  ```\n\n> ```excalidraw\n> {b}\n> ```\n";
    const f = findFences(src);
    let out = replaceFence(src, f[1]!, "{B1}\n{B2}");
    out = replaceFence(out, findFences(out)[0]!, "{A}");
    expect(out).toBe(
      "- item\n\n  ```excalidraw\n  {A}\n  ```\n\n> ```excalidraw\n> {B1}\n> {B2}\n> ```\n",
    );
  });

  it("keeps a list marker on the fence line as spaces", () => {
    const src = "1. ```excalidraw\n   {a}\n   ```\n";
    const out = replaceFence(src, findFences(src)[0]!, "{x}");
    expect(out).toBe("1. ```excalidraw\n   {x}\n   ```\n");
  });

  it("keeps CRLF", () => {
    const src = "a\r\n```excalidraw\r\n{old}\r\n```\r\nz\r\n";
    const out = replaceFence(src, findFences(src)[0]!, "{n1}\n{n2}");
    expect(out).toBe("a\r\n```excalidraw\r\n{n1}\r\n{n2}\r\n```\r\nz\r\n");
  });

  it("does not add a closing fence at end of file", () => {
    const src = "```excalidraw\n{old}";
    const f = findFences(src)[0]!;
    expect(f.json).toBe("{old}");
    expect(replaceFence(src, f, "{new}")).toBe("```excalidraw\n{new}");
  });

  it("replaces identical fences independently", () => {
    const src = `${doc("{same}")}\n\n${doc("{same}")}\n`;
    const out = replaceFence(src, findFences(src)[1]!, "{two}");
    expect(out).toBe(`${doc("{same}")}\n\n${doc("{two}")}\n`);
    expect(findFences(out).map((x) => x.json)).toEqual(["{same}", "{two}"]);
  });

  it("round-trips through findFences", () => {
    const src = `intro\r\n\r\n${doc("{a}", "~~~excalidraw x", "~~~")}\r\n\r\ntext\r\n\r\n${doc("{b}")}\r\nend`;
    const f = findFences(src);
    const out = replaceFence(src, f[0]!, "{new}");
    const after = findFences(out);
    expect(after[0]!.json).toBe("{new}");
    expect(after[1]!.json).toBe("{b}");
    expect(out.slice(0, f[0]!.start)).toBe(src.slice(0, f[0]!.start));
    expect(out.slice(out.length - (src.length - f[1]!.start))).toBe(src.slice(f[1]!.start));
  });
});

describe("maskFences", () => {
  it("replaces contents with their index", () => {
    const src = `x\n\n${doc("{big json}")}\n\n${doc("{big json}")}\n`;
    const masked = maskFences(src, findFences(src));
    expect(findFences(masked).map((x) => x.json)).toEqual(["0", "1"]);
  });
});
