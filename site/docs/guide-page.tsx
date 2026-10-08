import { GUIDES, guideByKey } from "./content";
import { Markdown } from "./markdown";

export function GuidePage({ guideKey }: { guideKey: string }): React.JSX.Element {
  const guide = guideByKey(guideKey);
  return (
    <div className="guide">
      <nav className="guide-list" aria-label="Guides">
        {GUIDES.map((g) => (
          <a
            key={g.key}
            href={`#/guide/${g.key}`}
            aria-current={g.key === guideKey ? "page" : undefined}
          >
            <span className="guide-list-title">{g.title}</span>
            <span className="guide-list-note">{g.note}</span>
          </a>
        ))}
      </nav>
      <article className="guide-body">
        {guide === undefined ? <h1>Page not found</h1> : <Markdown source={guide.body} />}
      </article>
    </div>
  );
}
