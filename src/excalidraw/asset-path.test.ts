import { expect, test } from "vitest";
import { setAssetPath } from "./asset-path";

test("sets the asset path and keeps it when called without a path", () => {
  setAssetPath("/a/");
  expect(window.EXCALIDRAW_ASSET_PATH).toBe("/a/");
  setAssetPath(undefined);
  expect(window.EXCALIDRAW_ASSET_PATH).toBe("/a/");
});
