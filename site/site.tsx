import { Header } from "./header";
import { HomePage } from "./home-page";
import { useHash, useSiteLocale, useTheme } from "./prefs";
import { parseRoute } from "./routes";

export function Site(): React.JSX.Element {
  const route = parseRoute(useHash());
  const theme = useTheme();
  const locale = useSiteLocale();
  return (
    <>
      <Header />
      <main className="site-main">
        {route.page === "home" ? (
          <HomePage locale={locale} theme={theme === "system" ? undefined : theme} />
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
