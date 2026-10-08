import type { Doc, EditorApi, LayerId } from "../../api";

const MAX_SIDE = 512;
const STRIP = 256;

function hidden(id: LayerId): (d: Doc) => Doc {
  return (d) => ({
    ...d,
    manifest: {
      ...d.manifest,
      layers: d.manifest.layers.map((l) => (l.id === id ? { ...l, isVisible: false } : l)),
    },
  });
}

/** What is under layer `id`: the composite with that layer hidden, subsampled to ~512 px on the long side. */
export function readBelow(api: EditorApi, id: LayerId): Uint8Array {
  const before = api.doc();
  const { width, height } = before.manifest;
  const step = Math.ceil(Math.max(width, height) / MAX_SIDE);
  const out: number[] = [];
  api.dispatch(hidden(id));
  try {
    for (let y = 0; y < height; y += STRIP) {
      const rows = Math.min(STRIP, height - y);
      const px = api.readComposite({ x: 0, y, width, height: rows });
      for (let row = 0; row < rows; row++) {
        if ((y + row) % step !== 0) continue;
        for (let x = 0; x < width; x += step) {
          const i = (row * width + x) * 4;
          out.push(px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0, px[i + 3] ?? 0);
        }
      }
    }
  } finally {
    api.dispatch(() => before);
  }
  return Uint8Array.from(out);
}
