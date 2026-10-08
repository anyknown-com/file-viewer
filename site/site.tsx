import { Header } from "./header";
import { useHash } from "./prefs";
import { parseRoute } from "./routes";

export function Site(): React.JSX.Element {
  const route = parseRoute(useHash());
  return (
    <>
      <Header />
      <main className="site-main">
        {route.page === "home" ? (
          <p>The playground goes here.</p>
        ) : (
          <div className="site-not-found">
            <h1>Page not found</h1>
            <a href="#/">Back to the playground</a>
          </div>
        )}
      </main>
    </>
  );
}
