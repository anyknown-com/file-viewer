# Third-party notices

Whoever adds a production dependency adds its line here in the same commit. Upgrading mediabunny updates its version and source URL here in the same commit.

## Code copied into this package

Each entry lists the upstream repository, commit, copied paths and the full MIT license text.

### Compositor

- Repository: https://github.com/robbietilton/Compositor
- Commit: 11d8d7a
- Copied paths: `IO/ProjectStore.swift`, `IO/ImageExporter.swift`, and the format rules in `Document/*.swift` (ported to TypeScript in `src/comp/`)
- License: MIT

```
MIT License

Copyright (c) 2026 Wonder Assembly LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### opencut-classic

- Repository: https://github.com/OpenCut-app/opencut-classic
- Commit: cf5e79e919144200294fb9fed22a222592a0aeea
- Copied paths: `apps/web/src/commands/base-command.ts`, `apps/web/src/commands/batch-command.ts` (ported to `src/video-editor/model/commands.ts`)
- License: MIT

```
MIT License

Copyright 2025-2026 OpenCut

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
```

## Runtime dependencies

- fflate 0.8.3, MIT, https://github.com/101arrowz/fflate
- zod 4.6.5, MIT, https://github.com/colinhacks/zod
- @base-ui/react 1.8.0, MIT, https://github.com/mui/base-ui
- mediabunny 1.61.1, MPL-2.0, used unmodified as an npm dependency, https://github.com/Vanilagy/mediabunny/tree/v1.61.1
- remark-parse 11.0.0, MIT, https://github.com/remarkjs/remark
- remark-gfm 4.0.1, MIT, https://github.com/remarkjs/remark-gfm
- unified 11.0.5, MIT, https://github.com/unifiedjs/unified
- react-markdown 10.1.0, MIT, https://github.com/remarkjs/react-markdown
- rehype-sanitize 6.0.0, MIT, https://github.com/rehypejs/rehype-sanitize
