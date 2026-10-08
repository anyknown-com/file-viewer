export type Route = { page: "home" } | { page: "not-found" };

export function parseRoute(hash: string): Route {
  if (hash === "" || hash === "#/") return { page: "home" };
  return { page: "not-found" };
}
