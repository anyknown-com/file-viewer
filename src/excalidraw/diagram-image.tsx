import { exportToSvg, getNonDeletedElements, restore } from "@excalidraw/excalidraw";
import { useCallback, useState, type ReactNode } from "react";
import type { Theme } from "../contract/props";
import { setAssetPath } from "./asset-path";
import { parseScene } from "./parse-scene";

/** Props of DiagramImage. */
export type DiagramImageProps = {
  /** The .excalidraw document text. */
  json: string;
  /** Color scheme the diagram is drawn in. */
  theme: Theme;
  /** Folder Excalidraw loads its fonts from. */
  assetPath?: string;
  /** Alternative text for the image. */
  alt: string;
  /** Shown until the image is ready. */
  loading: ReactNode;
  /** Shown when the export fails. */
  broken: ReactNode;
};

async function renderSvg(json: string, theme: Theme): Promise<Blob> {
  const parsed = parseScene(json);
  if (!parsed.ok) throw new Error("not an excalidraw scene");
  const restored = restore(parsed.scene as Parameters<typeof restore>[0], null, null);
  const svg = await exportToSvg({
    elements: getNonDeletedElements(restored.elements),
    appState: {
      ...restored.appState,
      exportWithDarkMode: theme === "dark",
      exportBackground: true,
    },
    files: restored.files,
  });
  return new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
}

/** Renders a scene as a static image; the Excalidraw editor never mounts here. */
export default function DiagramImage({
  json,
  theme,
  assetPath,
  alt,
  loading,
  broken,
}: DiagramImageProps) {
  // Idempotent global write; must happen before Excalidraw loads its fonts.
  setAssetPath(assetPath);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const ref = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img) return;
      let cancelled = false;
      let created: string | null = null;
      renderSvg(json, theme).then(
        (blob) => {
          if (cancelled) return;
          created = URL.createObjectURL(blob);
          setUrl(created);
        },
        () => {
          if (!cancelled) setFailed(true);
        },
      );
      return () => {
        cancelled = true;
        if (created) URL.revokeObjectURL(created);
      };
    },
    [json, theme],
  );

  if (failed) return broken;
  return (
    <>
      <img ref={ref} className="fv-diagram-img" alt={alt} src={url ?? undefined} />
      {url ? null : loading}
    </>
  );
}
