import { use } from "react";
import { defaultUrlTransform } from "react-markdown";
import type { ImageResolver } from "../contract/image-resolver";
import { useT } from "../i18n/use-t";
import { InLinkContext } from "./in-link";
import { markdownMessages } from "./messages";

type Props = { src: string; alt: string; resolveImage?: ImageResolver };

export function MarkdownImage({ src, alt, resolveImage }: Props): React.JSX.Element {
  const t = useT(markdownMessages);
  const inLink = use(InLinkContext);
  const shownAlt = alt.trim() === "" ? t("markdown.imageUntitled") : alt;
  const resolved = resolveImage?.(src, alt) ?? null;

  if (typeof resolved === "string") {
    return <img className="fv-md-img" src={resolved} alt={shownAlt} loading="lazy" />;
  }
  if (resolved) {
    const link = defaultUrlTransform(resolved.link);
    if (link !== "") {
      const host = new URL(link).host;
      const label = t("markdown.imageLink", { alt: shownAlt, host });
      if (inLink) return <span>{label}</span>;
      return (
        <a
          href={link}
          title={t("markdown.imageLinkTitle", { host })}
          target="_blank"
          rel="noopener noreferrer"
        >
          {label}
        </a>
      );
    }
  }
  return <span className="fv-md-img-alt">{t("markdown.image", { alt: shownAlt })}</span>;
}
