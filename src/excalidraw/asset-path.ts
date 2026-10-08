declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

/** Sets the folder Excalidraw loads its fonts from. Call it before the first diagram renders; an empty value keeps the current path. */
export function setAssetPath(path: string | undefined): void {
  if (path && window.EXCALIDRAW_ASSET_PATH !== path) window.EXCALIDRAW_ASSET_PATH = path;
}
