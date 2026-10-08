// A one-layer manifest for an image opened as a document (values as 09's fromImage writes them).
import type { Manifest } from "../../comp/index";
import type { LayerId } from "../api";

/** No `imageFile`: saving adds it (save/project-blob.ts). */
export function newManifest(o: {
  width: number;
  height: number;
  layerId: LayerId;
  name: string;
}): Manifest {
  const { width, height, layerId } = o;
  return {
    format: "com.compositor.project",
    version: 11,
    colorSpace: "sRGB",
    resolution: 72,
    documentID: crypto.randomUUID().toUpperCase(),
    width,
    height,
    activeLayerID: layerId,
    layers: [
      {
        id: layerId,
        name: o.name,
        isVisible: true,
        isGroup: false,
        opacity: 1,
        blendMode: "Normal",
        transform: {
          origin: [0, 0],
          size: [width, height],
          rotation: 0,
          flipX: false,
          flipY: false,
          sampling: "High quality",
        },
      },
    ],
  };
}
