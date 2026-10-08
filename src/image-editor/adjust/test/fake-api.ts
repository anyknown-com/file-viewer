import type { Doc, EditorApi, MessageKey, Rect, Session } from "../../api";

/** A just-enough EditorApi for panel tests: `labels` has the label of every dispatch, in order. */
export function fakeApi(doc: Doc): { api: EditorApi; labels: (MessageKey | undefined)[] } {
  let current = doc;
  let session: Session = {
    active: null,
    target: "image",
    tool: "move",
    collapsed: new Set(),
    renderHidden: new Set(),
  };
  const labels: (MessageKey | undefined)[] = [];
  const impl = {
    doc: () => current,
    dispatch(cmd: (d: Doc) => Doc, label?: MessageKey) {
      current = cmd(current);
      labels.push(label);
    },
    session: () => session,
    setSession(patch: Partial<Session>) {
      session = { ...session, ...patch };
    },
    readComposite: (rect: Rect) => new Uint8Array(rect.width * rect.height * 4).fill(128),
    selection: () => null,
    t: (key: MessageKey) => key,
  };
  const api = new Proxy(impl, {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      return () => {
        throw new Error("fakeApi");
      };
    },
  }) as unknown as EditorApi;
  return { api, labels };
}
