import { lazy, Suspense } from "react";
import { useT } from "../i18n/use-t";
import { Spinner } from "../primitives/spinner";
import { excalidrawMessages } from "./messages";
import { parseScene } from "./parse-scene";
import { useResolvedTheme } from "./use-resolved-theme";

const LazyDiagramImage = lazy(() => import("./diagram-image"));

// One diagram in the viewer: a static image, or a button that opens the editor. Needs ViewerRoot.
export function DiagramBlock({
  json,
  assetPath,
  onEdit,
}: {
  json: string;
  assetPath?: string;
  onEdit?: () => void;
}): React.JSX.Element {
  const t = useT(excalidrawMessages);
  const theme = useResolvedTheme();
  const parsed = parseScene(json);
  const broken = (
    <div className="fv-diagram-broken">
      <p>{t("excalidraw.broken")}</p>
      <pre>{json}</pre>
    </div>
  );
  if (!parsed.ok) return broken;

  const loading = (
    <span className="fv-diagram-loading">
      <Spinner label={t("excalidraw.loading")} />
      {t("excalidraw.loading")}
    </span>
  );
  const image = (
    <Suspense fallback={loading}>
      <LazyDiagramImage
        json={json}
        theme={theme}
        assetPath={assetPath}
        alt={parsed.alt}
        loading={loading}
        broken={broken}
      />
    </Suspense>
  );
  if (!onEdit) return <figure className="fv-diagram">{image}</figure>;
  return (
    <button type="button" className="fv-diagram" aria-label={t("excalidraw.edit")} onClick={onEdit}>
      {image}
      <span className="fv-diagram-hint">{t("excalidraw.edit")}</span>
    </button>
  );
}
