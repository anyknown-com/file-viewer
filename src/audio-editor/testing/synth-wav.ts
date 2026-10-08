import type { ByteSource } from "../../contract/byte-source";

/** 16-bit PCM WAV generated on demand; the whole file is never held in memory. */
export function synthWavSource(o: {
  seconds: number;
  sampleRate: number;
  channels: number;
  tone: (t: number, ch: number) => number;
}): ByteSource {
  const frames = Math.round(o.seconds * o.sampleRate);
  const dataBytes = frames * o.channels * 2;
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  header.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, 36 + dataBytes, true);
  header.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, o.channels, true);
  view.setUint32(24, o.sampleRate, true);
  view.setUint32(28, o.sampleRate * o.channels * 2, true);
  view.setUint16(32, o.channels * 2, true);
  view.setUint16(34, 16, true);
  header.set([0x64, 0x61, 0x74, 0x61], 36);
  view.setUint32(40, dataBytes, true);

  return {
    size: 44 + dataBytes,
    async read(start, end, signal) {
      signal?.throwIfAborted();
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end) {
        throw new RangeError(`read(${start}, ${end})`);
      }
      if (end > 44 + dataBytes) throw new RangeError(`read(${start}, ${end})`);
      const out = new Uint8Array(end - start);
      let cachedIndex = -1;
      let cachedValue = 0;
      for (let b = start; b < end; b++) {
        if (b < 44) {
          out[b - start] = header[b];
          continue;
        }
        const index = (b - 44) >> 1;
        if (index !== cachedIndex) {
          const frame = Math.floor(index / o.channels);
          const v = o.tone(frame / o.sampleRate, index % o.channels);
          cachedValue = Math.round(Math.max(-1, Math.min(1, v)) * 32767) & 0xffff;
          cachedIndex = index;
        }
        out[b - start] = (b - 44) & 1 ? cachedValue >> 8 : cachedValue & 0xff;
      }
      return out;
    },
  };
}
