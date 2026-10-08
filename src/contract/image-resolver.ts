/** What a Markdown image resolves to: a URL to show, an object with a link to open instead, or null to show nothing. */
export type ImageResolution = string | { link: string } | null;
/** Maps a Markdown image's src and alt text to an ImageResolution. */
export type ImageResolver = (src: string, alt: string) => ImageResolution;
