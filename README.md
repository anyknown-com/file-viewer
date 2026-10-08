# @anyknown/file-viewer

A React component library for viewing and editing files in the browser. Hand it a file's bytes and it shows images, video, audio, PDF, text, Markdown and Excalidraw drawings, and lets you edit them in the same component; when you save, it hands back a `Blob`. It talks to no server, so it can sit inside an end-to-end encrypted product.

## Status

Versions 0.0.x only hold the package name on npm and have no API. The first usable version is 0.1.0.

## Planned formats

| Kind | View | Edit |
| --- | --- | --- |
| image (jpeg / png / webp / avif / gif / bmp / svg) | yes | v0.3 |
| video / audio (native player, up to 64 MiB) | yes | v0.2 |
| pdf (browser's built-in viewer) | yes | no |
| text / json (up to 1 MiB, monospace) | yes | later |
| markdown (typeset, ` ```excalidraw ` blocks drawn as figures, `resolveImage`) | yes | figures: yes; text: later |
| `.excalidraw` | yes | yes |
| anything else | `unsupported` state (icon and note; the host provides the download button) | n/a |

## Development

| script | what it does |
| --- | --- |
| `pnpm build` | `tsdown` |
| `pnpm typecheck` | `tsc --noEmit && tsc --noEmit -p tsconfig.comp.json` |
| `pnpm lint` | `oxlint` |
| `pnpm fmt` / `pnpm fmt:check` | `oxfmt` / `oxfmt --check` |
| `pnpm check:entry` | `tsdown && node scripts/check-entry-deps.mjs` |
| `pnpm check` | `turbo run typecheck lint fmt:check check:entry` |
| `pnpm test` | `vitest run --project jsdom` |
| `pnpm test:browser` | `vitest run --project browser` |
| `pnpm verify:pack` | `pnpm build && node scripts/verify-pack.mjs` |
| `pnpm check:licenses` | `node scripts/check-licenses.mjs` |

## Release

The version is set by a git tag. Push a `v*` tag and `.github/workflows/release.yml` runs the full gate, then publishes. If the tag does not match `version` in `package.json`, the workflow fails and nothing is published.

```bash
# 1. Bump version in package.json (semver)
# 2. Commit, tag and push
git commit -am "release: v0.1.0"
git tag v0.1.0
git push origin main --tags
```

Publishing uses npm trusted publishing (OIDC); the repo stores no npm credentials. CI uses `npm publish`, not `pnpm publish`, because pnpm's OIDC support is not ready yet ([pnpm#9812](https://github.com/pnpm/pnpm/issues/9812)).

v0.0.1 was published by hand from a local machine: npm can only attach a trusted publisher to a package that already exists, so the first version had no way around it. Every version since goes through a tag.

## License

MIT. Third-party notices are in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
