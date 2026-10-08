// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/ImageAdjustments.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { AdjustmentSettings } from "../api";

/**
 * `ExposureSettings.table`: decode sRGB to linear light, scale by 2^exposure, add offset, apply
 * 1/gamma, encode back. Same layout as `levelsLut`; the one curve runs on every channel.
 */
export function exposureLut(s: AdjustmentSettings): Float32Array {
  const { exposure, offset, gamma } = s.exposureSettings ?? { exposure: 0, offset: 0, gamma: 1 };
  const scale = Math.pow(2, exposure);
  const lut = new Float32Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const encoded = i / 255;
    let linear = encoded <= 0.04045 ? encoded / 12.92 : Math.pow((encoded + 0.055) / 1.055, 2.4);
    linear = Math.pow(Math.max(0, linear * scale + offset), 1 / gamma);
    const output = linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
    const v = Math.min(1, Math.max(0, output));
    lut.set([v, v, v, 1], i * 4);
  }
  return lut;
}
