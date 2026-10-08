export type ImageResolution = string | { link: string } | null;
export type ImageResolver = (src: string, alt: string) => ImageResolution;
