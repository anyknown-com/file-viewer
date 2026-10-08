declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

// Excalidraw reads this global to find its fonts; it must be set before the first export.
export function setAssetPath(path: string | undefined): void {
  if (path && window.EXCALIDRAW_ASSET_PATH !== path) window.EXCALIDRAW_ASSET_PATH = path;
}
