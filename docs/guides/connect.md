# Connect your app

What your app needs around `FileViewer`: a Content Security Policy, the theme, fonts and the bundler. Install and the first render are in [Getting started](./getting-started.md).

## Content Security Policy

The viewer works under this policy. This website itself is served with exactly this header.

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; frame-src blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

Each source beyond `'self'`, and why the viewer needs it:

| Directive and source           | Why                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `img-src blob: data:`          | Images and diagrams are shown from object URLs.                                                                                         |
| `media-src blob:`              | Video and audio play from object URLs.                                                                                                  |
| `frame-src blob:`              | PDFs load in an `<iframe>` from a blob URL of type `application/pdf`, and the browser's built-in viewer draws them. Required for PDFs. |
| `script-src 'wasm-unsafe-eval'` | Excalidraw compiles WebAssembly to subset fonts when it exports SVG.                                                                    |
| `style-src 'unsafe-inline'`    | Components position elements with inline `style` attributes.                                                                            |

### PDF

Keep `object-src 'none'`. Measured on 2026-10-08 in headless Chrome 155 and Chromium 153, on a page with this policy:

- An `<iframe src="blob:…">` with a `Blob` of type `application/pdf`, without a `sandbox` attribute, shows the PDF.
- `<embed>` and `<object>` are blocked by `object-src 'none'`.
- Without `frame-src blob:`, the iframe is blocked.

The viewer uses an iframe. If your app shows PDFs itself, do the same; do not use `<embed>` or `<object>`.

### Not needed

- `connect-src` needs no extra sources. The package never makes network requests.
- No `blob:` workers.
- No inline scripts.
- No third-party font domains.

## Theme

The viewer's root element, `.fv-root`, carries `data-theme` when you pass `theme` (`"light"` or `"dark"`). Without `theme`, it follows the operating system.

The `data-theme="light"` subtree selectors in `tokens.css` need `@anyknown/ui` `>=0.11.0`.

To use your own colors, override the `--ak-*` variables on `.fv-root`:

```css
.fv-root {
  --ak-bg: #fbfaf7;
  --ak-text: #1d1b16;
  --ak-accent: #0f766e;
}
```

## Fonts

The tokens name Figtree, Geist Mono and Noto Sans TC in their font stacks. The package does not load these fonts. To get them, install them and import them once in your app:

```sh
pnpm add @fontsource-variable/figtree @fontsource-variable/geist-mono @fontsource-variable/noto-sans-tc
```

```ts
import "@fontsource-variable/figtree";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/noto-sans-tc";
```

This is what this website does. The fonts are bundled and served from your own origin, so the policy above does not change.

### Excalidraw fonts

Diagrams (`.excalidraw` files and `excalidraw` fences in Markdown) need Excalidraw's fonts. Copy `node_modules/@anyknown/file-viewer/dist/excalidraw-assets/` (it holds `fonts/`) into a static directory on your own origin, for example `public/excalidraw-assets/`, and pass that directory's URL to `FileViewer`:

```tsx
<FileViewer file={file} excalidraw={{ assetPath: "/excalidraw-assets/" }} />
```

Without `assetPath`, Excalidraw loads its fonts from `esm.sh`. The policy above blocks that request and the browser reports a violation.

## Video editor

The video editor takes its options from the `editor` prop of `FileViewer`.

- `editor.assets` is an `AssetProvider`. Its `list()` returns the videos, audio files and images your app offers, and `open(id)` returns a `ByteSource` for one of them (`blobSource(file)` wraps a `File`). They appear in the editor's media bin next to the opened file.
- `editor.maxOutputBytes` caps the size of the exported MP4. The editor estimates the size before it starts and refuses an export that would go over.

The editor needs no wider CSP and opens no workers. It reads and writes everything in the page, and an export is handed to `onSave` as an `.mp4` Blob in `export` mode.

## Vite

Version 0.1 only needs the Excalidraw fonts copied. This website does it with a small plugin, `site/excalidraw-assets.ts`:

```ts
// Vite plugin: serves and copies the Excalidraw fonts so the page never asks esm.sh for them.
import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { Plugin } from "vite";

const PREFIX = "/excalidraw-assets/fonts/";
const TYPES: Record<string, string> = { ".woff2": "font/woff2", ".woff": "font/woff" };

export function copyExcalidrawAssets(from: string, to: string): void {
  cpSync(from, to, { recursive: true });
}

export function excalidrawAssets(): Plugin {
  let root = "";
  let outDir = "";
  return {
    name: "excalidraw-assets",
    configResolved(config) {
      root = config.root;
      outDir = join(config.root, config.build.outDir);
    },
    configureServer(server) {
      const fonts = join(root, "..", "node_modules/@excalidraw/excalidraw/dist/prod/fonts");
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0] ?? "";
        if (!url.startsWith(PREFIX)) return next();
        const file = normalize(join(fonts, url.slice(PREFIX.length)));
        if (!file.startsWith(fonts) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      copyExcalidrawAssets(
        join(root, "..", "dist/excalidraw-assets"),
        join(outDir, "excalidraw-assets"),
      );
    },
  };
}
```

The editors and Markdown become separate chunks, which load the first time they are used.
