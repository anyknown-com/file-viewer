export type AdjustColor = { red: number; green: number; blue: number };

const byte = (v: number) =>
  Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, "0");

export function toHex(c: AdjustColor): string {
  return `#${byte(c.red)}${byte(c.green)}${byte(c.blue)}`;
}

export function fromHex(hex: string): AdjustColor {
  const n = Number.parseInt(hex.slice(1), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}
