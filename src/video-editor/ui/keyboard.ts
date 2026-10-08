export type KeyAction =
  | "toggle"
  | "pause"
  | "play"
  | "back5"
  | "prevFrame"
  | "nextFrame"
  | "split"
  | "delete"
  | "rippleDelete"
  | "undo"
  | "redo"
  | "deselect";

export type KeyInput = {
  key: string;
  code: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  target: EventTarget | null;
};

const TEXT_FIELD = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
/** Space activates these natively; also toggling playback would act twice. */
const CONTROL =
  'button, a[href], [role="button"], [role="menuitem"], [role="radio"], [role="switch"]';

const closest = (target: EventTarget | null, selector: string): boolean =>
  target instanceof Element && target.closest(selector) !== null;

const BY_CODE: Readonly<Record<string, KeyAction>> = {
  KeyK: "pause",
  KeyL: "play",
  KeyJ: "back5",
  KeyS: "split",
};

const BY_KEY: Readonly<Record<string, KeyAction>> = {
  ArrowLeft: "prevFrame",
  ArrowRight: "nextFrame",
  Delete: "delete",
  Backspace: "delete",
  Escape: "deselect",
};

function withModifier(e: KeyInput): KeyAction | null {
  if (e.code === "KeyZ") return e.shiftKey ? "redo" : "undo";
  if (e.code === "KeyY" && e.ctrlKey) return "redo";
  return null;
}

/** Maps a keydown to an editor action. Letters go by `code`, so IMEs and layouts do not matter. */
export function keyAction(e: KeyInput): KeyAction | null {
  if (closest(e.target, TEXT_FIELD)) return null;
  if (e.metaKey || e.ctrlKey) return withModifier(e);
  if (e.code === "Space" || e.key === " ") return closest(e.target, CONTROL) ? null : "toggle";
  const action = BY_CODE[e.code] ?? BY_KEY[e.key] ?? null;
  return action === "delete" && e.shiftKey ? "rippleDelete" : action;
}
