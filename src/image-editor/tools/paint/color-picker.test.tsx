import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ViewerRoot } from "../../../primitives/root";
import { ColorPicker, hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from "./color-picker";

it("parses short and long hex in any case", () => {
  expect(hexToRgb("#F00")).toEqual([255, 0, 0]);
  expect(hexToRgb("#ff0000")).toEqual([255, 0, 0]);
  expect(hexToRgb("#12aBcD")).toEqual([0x12, 0xab, 0xcd]);
  expect(hexToRgb("#12")).toBeNull();
  expect(hexToRgb("ff0000")).toBeNull();
  expect(hexToRgb("#ggg")).toBeNull();
  expect(rgbToHex([18, 171, 205])).toBe("#12abcd");
});

it("round-trips HSV and RGB within 1", () => {
  for (let r = 0; r <= 255; r += 51) {
    for (let g = 0; g <= 255; g += 17) {
      for (let b = 0; b <= 255; b += 85) {
        const back = hsvToRgb(rgbToHsv([r, g, b]));
        for (const [i, v] of [r, g, b].entries())
          expect(Math.abs(back[i]! - v)).toBeLessThanOrEqual(1);
      }
    }
  }
  expect(rgbToHsv([255, 0, 0])).toEqual([0, 1, 1]);
  expect(hsvToRgb([120, 1, 1])).toEqual([0, 255, 0]);
});

it("takes a valid hex and ignores an invalid one", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const onChange = vi.fn<(v: [number, number, number, number]) => void>();
  render(
    <ViewerRoot>
      <ColorPicker value={[0, 0, 0, 255]} onChange={onChange} />
    </ViewerRoot>,
  );
  const input = screen.getByLabelText("Hex");
  fireEvent.change(input, { target: { value: "#12" } });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "#00f" } });
  expect(onChange).toHaveBeenCalledWith([0, 0, 255, 255]);
});
