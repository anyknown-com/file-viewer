import { useT } from "../../i18n/use-t";
import { Button } from "../../primitives/button";
import type { EditorApi, Layer, LayerDecor } from "../api";
import { focusEffects } from "../effects/focus";
import { adjustMessages } from "./messages";
import { KIND_KEY } from "./settings";

function HalfCircle(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
    </svg>
  );
}

export function LayerBadge({
  layer,
  api,
}: {
  layer: Layer;
  api: EditorApi;
}): React.JSX.Element | null {
  const t = useT(adjustMessages);
  const hasEffects = layer.effects !== undefined && Object.keys(layer.effects).length > 0;
  if (!layer.adjustment && !hasEffects) return null;
  return (
    <>
      {layer.adjustment ? (
        <Button
          variant="ghost"
          className="fv-ie-adj-badge"
          aria-label={t(`image.adjust.kind.${KIND_KEY[layer.adjustment.kind]}`)}
          icon={<HalfCircle />}
          onClick={() => api.setSession({ active: layer.id })}
        />
      ) : null}
      {hasEffects ? (
        <Button
          variant="ghost"
          className="fv-ie-adj-badge"
          aria-label={t("image.effects.open")}
          onClick={() => {
            api.setSession({ active: layer.id });
            focusEffects(layer.id);
          }}
        >
          fx
        </Button>
      ) : null}
    </>
  );
}

export const adjustDecor: LayerDecor = {
  id: "image.adjust",
  badge: (layer, api) => <LayerBadge layer={layer} api={api} />,
};
