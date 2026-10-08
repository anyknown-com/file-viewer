import type { Locale } from "@anyknown/file-viewer";
import { Playground } from "./playground/playground";

export function HomePage({
  locale,
  theme,
}: {
  locale: Locale;
  theme?: "light" | "dark";
}): React.JSX.Element {
  return (
    <>
      <Playground locale={locale} theme={theme} />
      <section className="site-install">
        <pre className="site-code">
          <code>pnpm add @anyknown/file-viewer @anyknown/ui</code>
        </pre>
        <nav className="site-next" aria-label="Docs">
          <a href="#/guide/getting-started">Getting started</a>
          <a href="#/guide/connect">Connect your app</a>
          <a href="#/api">API</a>
        </nav>
      </section>
    </>
  );
}
