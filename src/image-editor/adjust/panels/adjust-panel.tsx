import { useT } from "../../../i18n/use-t";
import { Button } from "../../../primitives/button";
import type { EditorApi, Layer } from "../../api";
import { setAdjustment } from "../commands";
import { adjustMessages } from "../messages";
import { defaultAdjustment, KIND_KEY, randomSeed } from "../settings";
import { GenericPanel } from "./generic-panel";

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
      <GenericPanel layer={layer} api={api} />
      <Button onClick={reset}>{t("image.adjust.reset")}</Button>
    </section>
  );
}
