import { useT } from "../../../i18n/use-t";
import { Button } from "../../../primitives/button";
import type { EditorApi } from "../../api";
import { selectPaintMessages } from "../messages";
import { setToolState, toolState, useToolState, type RGBA } from "../state";

export function swapColors(api: EditorApi): void {
  const { fg, bg } = toolState(api);
  setToolState(api, { fg: bg, bg: fg });
}

export function defaultColors(api: EditorApi): void {
  setToolState(api, { fg: [0, 0, 0, 255], bg: [255, 255, 255, 255] });
}

function Chip({ color }: { color: RGBA }): React.JSX.Element {
  const [r, g, b, a] = color;
  return (
    <span
      aria-hidden
      style={{
        display: "block",
        width: 16,
        height: 16,
        borderRadius: "var(--ak-radius-md)",
        border: "1px solid var(--ak-border-control)",
        background: `rgba(${r}, ${g}, ${b}, ${a / 255})`,
      }}
    />
  );
}

/** Foreground and background chips, swap and default. The chips open the picker in step 4. */
export function ColorSwatches({ api }: { api: EditorApi }): React.JSX.Element {
  const t = useT(selectPaintMessages);
  const { fg, bg } = useToolState(api);
  return (
    <>
      <Button variant="ghost" aria-label={t("image.paint.foreground")} icon={<Chip color={fg} />} />
      <Button variant="ghost" aria-label={t("image.paint.background")} icon={<Chip color={bg} />} />
      <Button variant="ghost" onClick={() => swapColors(api)}>
        {t("image.paint.swap")}
      </Button>
      <Button variant="ghost" onClick={() => defaultColors(api)}>
        {t("image.paint.defaultColors")}
      </Button>
    </>
  );
}
