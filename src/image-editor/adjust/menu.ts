import type { AdjustmentKind, EditorApi } from "../api";
import { registerLayerDecor, registerMenuItem, registerPropertyPanel } from "../registry";
import { adjustDecor } from "./badge";
import { addAdjustmentLayer } from "./commands";
import { AdjustPanel } from "./panels/adjust-panel";
import { ADJUSTMENT_KINDS, defaultAdjustment, KIND_KEY } from "./settings";

function addLayer(api: EditorApi, kind: AdjustmentKind) {
  const id = crypto.randomUUID().toUpperCase();
  const { width, height } = api.doc().manifest;
  const sel = api.selection();
  const opts = {
    id,
    kind,
    name: api.t(`image.adjust.kind.${KIND_KEY[kind]}`),
    width,
    height,
    active: api.session().active,
    settings: defaultAdjustment(kind),
  };
  if (!sel) {
    api.dispatch(addAdjustmentLayer({ ...opts, withMask: false }), "image.adjust.add");
  } else {
    // One undo step: the layer and its mask pixels are committed together.
    api.dispatch(addAdjustmentLayer({ ...opts, withMask: true }));
    const rect = { x: 0, y: 0, width, height };
    api.writeRegion(id, "mask", rect, sel.read(rect));
    api.commit("image.adjust.add", api.doc(), []);
  }
  api.setSession({ active: id });
}

export function registerAdjustUi(): void {
  registerLayerDecor(adjustDecor);
  registerPropertyPanel({
    id: "image.adjust",
    order: 100,
    when: (layer) => layer.adjustment !== undefined,
    component: AdjustPanel,
  });
  ADJUSTMENT_KINDS.forEach((kind, index) => {
    registerMenuItem({
      id: `image.adjust.add.${KIND_KEY[kind]}`,
      menu: "layer-new",
      label: `image.adjust.kind.${KIND_KEY[kind]}`,
      order: 100 + index,
      run: (api) => addLayer(api, kind),
    });
  });
}
