import type { Locale } from "@anyknown/file-viewer";
import { Select } from "@base-ui/react/select";
import { setLocale, setTheme, useSiteLocale, useTheme, type ThemeMode } from "./prefs";

const THEMES: { mode: ThemeMode; label: string }[] = [
  { mode: "system", label: "System" },
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
];

const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh-TW", label: "繁體中文" },
];

export function Header(): React.JSX.Element {
  const theme = useTheme();
  const locale = useSiteLocale();
  return (
    <header className="site-header">
      <a className="site-wordmark" href="#/">
        file-viewer
      </a>
      <nav className="site-nav" aria-label="Site">
        <a href="#/">Playground</a>
        <a href="#/guide/getting-started">Getting started</a>
        <a href="#/guide/connect">Connect your app</a>
        <a href="#/api">API</a>
      </nav>
      <div className="site-tools">
        <fieldset className="site-theme" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.mode}
              type="button"
              aria-pressed={theme === t.mode}
              onClick={() => setTheme(t.mode)}
            >
              {t.label}
            </button>
          ))}
        </fieldset>
        <Select.Root
          value={locale}
          items={LOCALES}
          onValueChange={(v) => {
            if (v !== null) setLocale(v);
          }}
        >
          <Select.Trigger className="site-locale" aria-label="Component language">
            <Select.Value />
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner alignItemWithTrigger={false} sideOffset={4}>
              <Select.Popup className="site-locale-popup">
                <Select.List>
                  {LOCALES.map((l) => (
                    <Select.Item key={l.value} value={l.value} className="site-locale-item">
                      <Select.ItemText>{l.label}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.List>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
        <a className="site-github" href="https://github.com/anyknown-com/file-viewer">
          GitHub
        </a>
      </div>
    </header>
  );
}
