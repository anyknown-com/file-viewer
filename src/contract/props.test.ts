import { describe, expectTypeOf, it } from "vitest";
import type { ByteSource } from "./byte-source";
import type { AssetProvider, CommonProps, FileViewerProps } from "./props";
import type { SaveHandler } from "./save";

describe("props types", () => {
  it("FileViewerProps works without onSave", () => {
    expectTypeOf<{ file: FileViewerProps["file"] }>().toMatchTypeOf<FileViewerProps>();
  });
  it("onSave is optional SaveHandler", () => {
    expectTypeOf<FileViewerProps["onSave"]>().toEqualTypeOf<SaveHandler | undefined>();
  });
  it("theme is light or dark", () => {
    expectTypeOf<CommonProps["theme"]>().toEqualTypeOf<"light" | "dark" | undefined>();
  });
  it("AssetProvider.open resolves a ByteSource", () => {
    expectTypeOf<ReturnType<AssetProvider["open"]>>().toEqualTypeOf<Promise<ByteSource>>();
  });
});
