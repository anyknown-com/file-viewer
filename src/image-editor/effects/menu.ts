import type { EditorApi, Layer } from "../api";
import { registerMenuItem, registerPropertyPanel } from "../registry";
import { copiedEffects, copyEffects } from "./clipboard";
import { setEffects } from "./commands";
import { focusEffects } from "./focus";
import { EffectsPanel } from "./panel";

const activeLayer = (api: EditorApi): Layer | undefined => {
  const id = api.session().active;
  return api.doc().manifest.layers.find((l) => l.id === id);
};
const plain = (api: EditorApi) => {
  const l = activeLayer(api);
  return l !== undefined && !l.isGroup && l.adjustment === undefined ? l : undefined;
};

function reveal(api: EditorApi, layer: Layer): void {
  const layers = api.doc().manifest.layers;
  const collapsed = new Set(api.session().collapsed);
  for (let p = layer.parentID; p; p = layers.find((l) => l.id === p)?.parentID) collapsed.delete(p);
  api.setSession({ collapsed });
}

export function registerEffectsUi(): void {
  registerPropertyPanel({
    id: "image.effects",
    order: 200,
    when: (layer) => !layer.isGroup && layer.adjustment === undefined,
    component: EffectsPanel,
  });
  registerMenuItem({
    id: "image.effects.open",
    menu: "layer-context",
    label: "image.effects.open",
    order: 200,
    enabled: (api) => plain(api) !== undefined,
    run(api) {
      const layer = plain(api);
      if (!layer) return;
      reveal(api, layer);
      focusEffects(layer.id);
    },
  });
  registerMenuItem({
    id: "image.effects.copy",
    menu: "layer-context",
    label: "image.effects.copy",
    order: 201,
    enabled: (api) => plain(api)?.effects !== undefined,
    run(api) {
      const effects = plain(api)?.effects;
      if (effects) copyEffects(effects);
    },
  });
  registerMenuItem({
    id: "image.effects.paste",
    menu: "layer-context",
    label: "image.effects.paste",
    order: 202,
    enabled: (api) => plain(api) !== undefined && copiedEffects() !== null,
    run(api) {
      const layer = plain(api);
      const effects = copiedEffects();
      if (layer && effects) api.dispatch(setEffects(layer.id, effects), "image.effects.paste");
    },
  });
  registerMenuItem({
    id: "image.effects.clear",
    menu: "layer-context",
    label: "image.effects.clear",
    order: 203,
    enabled: (api) => plain(api)?.effects !== undefined,
    run(api) {
      const layer = plain(api);
      if (layer) api.dispatch(setEffects(layer.id, undefined), "image.effects.clear");
    },
  });
}
