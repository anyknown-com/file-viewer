let installed = false;

// Idempotent; ImageEditor calls it on mount. 11, 12 and 13 each add one import and one call
// to their register function here (explicit calls: "sideEffects" would drop bare imports).
export function installExtensions(): void {
  if (installed) return;
  installed = true;
}
