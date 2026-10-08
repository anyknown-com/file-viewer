import { useT } from "../../../i18n/use-t";
import { Button } from "../../../primitives/button";
import type { EditorApi, Layer } from "../../api";
import { setAdjustment } from "../commands";
import { adjustMessages } from "../messages";
import { defaultAdjustment, KIND_KEY, randomSeed } from "../settings";
import { CurvesPanel } from "./curves-panel";
import { GenericPanel } from "./generic-panel";
import { HueSaturationPanel } from "./hue-saturation-panel";
import { LevelsPanel } from "./levels-panel";

function KindPanel({ layer, api }: { layer: Layer; api: EditorApi }): React.JSX.Element {
  const key = layer.adjustment ? KIND_KEY[layer.adjustment.kind] : null;
  if (key === "levels") return <LevelsPanel layer={layer} api={api} />;
  if (key === "curves") return <CurvesPanel layer={layer} api={api} />;
  if (key === "hueSaturation") return <HueSaturationPanel layer={layer} api={api} />;
  return <GenericPanel layer={layer} api={api} />;
}

export function AdjustPanel({ api, layer }: { api: EditorApi; layer: Layer }): React.JSX.Element {
  const t = useT(adjustMessages);
  const adjustment = layer.adjustment;
  if (!adjustment) return <></>;
  const reset = () => {
    const seed = adjustment.noiseSeed ?? adjustment.grainSettings?.seed ?? randomSeed();
    api.dispatch(
      setAdjustment(layer.id, defaultAdjustment(adjustment.kind, seed)),
      "image.adjust.reset",
    );
  };
  return (
    <section className="fv-ie-adj-panel" aria-label={t("image.adjust.open")}>
      <h3 className="fv-ie-adj-title">{t(`image.adjust.kind.${KIND_KEY[adjustment.kind]}`)}</h3>
      <KindPanel layer={layer} api={api} />
      <Button onClick={reset}>{t("image.adjust.reset")}</Button>
    </section>
  );
}
