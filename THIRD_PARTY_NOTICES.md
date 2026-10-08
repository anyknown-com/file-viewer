# Third-party notices

Whoever adds a production dependency adds its line here in the same commit. Upgrading mediabunny updates its version and source URL here in the same commit.

## Code copied into this package

Each entry lists the upstream repository, commit, copied paths and the full MIT license text.

### Compositor

- Repository: https://github.com/robbietilton/Compositor
- Commit: 11d8d7a
- Copied paths: `IO/ProjectStore.swift`, `IO/ImageExporter.swift`, and the format rules in `Document/*.swift` (ported to TypeScript in `src/comp/`); `Rendering/LiveMaskRenderer.swift` (ported in `src/image-editor/engine/`); `Document/LayerTransform.swift` transform drag and snap (ported in `src/image-editor/tools/`)
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
- Copied paths: `apps/web/src/services/video-cache/service.ts` (ported to `src/video-editor/engine/frame-cache.ts`)
- Copied paths: `apps/web/src/services/renderer/scene-exporter.ts` (ported to `src/video-editor/export/export.ts`)
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
- @excalidraw/excalidraw 0.18.1, MIT, https://github.com/excalidraw/excalidraw
- @fontsource-variable/geist 5.3.0, OFL-1.1, font files, https://github.com/vercel/geist-font

## Bundled fonts

`dist/excalidraw-assets/fonts` is copied from @excalidraw/excalidraw 0.18.1 at build time, unmodified.

- Excalifont, SIL OFL 1.1
- Virgil, SIL OFL 1.1
- Xiaolai, SIL OFL 1.1
- Nunito, SIL OFL 1.1
- Lilita One, SIL OFL 1.1
- Cascadia Code, SIL OFL 1.1
- Liberation Sans, SIL OFL 1.1
- Assistant, SIL OFL 1.1
- Comic Shanns, MIT

```
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```
