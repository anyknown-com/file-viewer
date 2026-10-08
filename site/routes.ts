export type Route = { page: "home" } | { page: "guide"; key: string } | { page: "not-found" };

export function parseRoute(hash: string): Route {
  if (hash === "" || hash === "#/") return { page: "home" };
  const guide = /^#\/guide\/([^/]+)$/.exec(hash);
  if (guide !== null) return { page: "guide", key: decodeURIComponent(guide[1] ?? "") };
  return { page: "not-found" };
}
