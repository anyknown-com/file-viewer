import { defaultSchema, type Options } from "rehype-sanitize";

// src is left unrestricted here: every <img> goes through MarkdownImage, which asks the host.
export const markdownSchema: Options = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, src: null },
};
