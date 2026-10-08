export type Scene = {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

export type ParsedScene = { ok: true; scene: Scene; alt: string } | { ok: false };

type Item = { type?: unknown; isDeleted?: unknown; text?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function altOf(elements: unknown[]): string {
  const texts: string[] = [];
  for (const el of elements) {
    if (texts.length === 10) break;
    const item = (isRecord(el) ? el : {}) as Item;
    if (item.type === "text" && item.isDeleted !== true && typeof item.text === "string") {
      texts.push(item.text);
    }
  }
  return texts.join(" ");
}

// Reads a .excalidraw document without loading Excalidraw.
export function parseScene(json: string): ParsedScene {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false };
  }
  if (!isRecord(data) || data.type !== "excalidraw" || !Array.isArray(data.elements)) {
    return { ok: false };
  }
  const scene: Scene = {
    elements: data.elements,
    appState: isRecord(data.appState) ? data.appState : {},
    files: isRecord(data.files) ? data.files : {},
  };
  return { ok: true, scene, alt: altOf(data.elements) };
}
