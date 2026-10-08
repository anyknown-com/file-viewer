// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkLicenses } from "./check-licenses.mjs";

const pkg = (license, name) => ({ [license]: [{ name }] });

describe("checkLicenses", () => {
  it("rejects GPL", () => {
    expect(checkLicenses(pkg("GPL-3.0", "x"), [], "")).toHaveLength(1);
  });
  it("allows MPL-2.0 for mediabunny only", () => {
    expect(checkLicenses(pkg("MPL-2.0", "mediabunny"), ["mediabunny"], "mediabunny")).toEqual([]);
    expect(checkLicenses(pkg("MPL-2.0", "other"), [], "")).toHaveLength(1);
  });
  it("passes an OR expression with an allowed option", () => {
    expect(checkLicenses(pkg("(MIT OR GPL-3.0)", "y"), [], "")).toEqual([]);
  });
  it("requires every dependency in the notices", () => {
    expect(checkLicenses({}, ["zod"], "nothing here")).toHaveLength(1);
  });
  it("allows OFL-1.1 for fontsource packages only", () => {
    const font = "@fontsource-variable/geist";
    expect(checkLicenses(pkg("OFL-1.1", font), [font], font)).toEqual([]);
    expect(
      checkLicenses(
        pkg("OFL-1.1", "@fontsource/inter"),
        ["@fontsource/inter"],
        "@fontsource/inter",
      ),
    ).toEqual([]);
    expect(checkLicenses(pkg("OFL-1.1", "other-font"), [], "")).toHaveLength(1);
    expect(checkLicenses(pkg("GPL-3.0", "@fontsource/inter"), [], "")).toHaveLength(1);
  });
  it("passes an empty report", () => {
    expect(checkLicenses({}, [], "")).toEqual([]);
  });
});
