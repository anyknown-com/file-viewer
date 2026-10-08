import { useCallback, useState, useSyncExternalStore } from "react";
import { useT } from "../../i18n/use-t";
import { Button } from "../../primitives/button";
import { Icon } from "../../primitives/icon";
import { Progress } from "../../primitives/progress";
import { Tooltip } from "../../primitives/tooltip";
import type { AssetEntry, AssetStore } from "../engine/assets";
import { videoMessages } from "../messages";
import { addAsset } from "../model/edits";
import type { Lane } from "../model/placement";
import { type AssetKind, SOURCE_ASSET_ID } from "../model/project";
import type { Ticks } from "../model/time";
import type { EditorSession } from "./session";

/** The drag payload type: an asset id dropped on a timeline row. */
export const ASSET_MIME = "application/x-fv-asset";

type Listing = { entries: AssetEntry[] | null };

/**
 * `assets.list()` as an external store. The snapshot is replaced when the list arrives and on
 * every status change, so rows re-render as assets load.
 */
class AssetListing {
  #snapshot: Listing = { entries: null };
  #started = false;
  readonly #listeners = new Set<() => void>();
  readonly assets: AssetStore;

  constructor(assets: AssetStore) {
    this.assets = assets;
  }

  readonly snapshot = (): Listing => this.#snapshot;

  readonly subscribe = (l: () => void): (() => void) => {
    this.#listeners.add(l);
    const off = this.assets.subscribe(() => this.#set(this.#snapshot.entries));
    if (!this.#started) {
      this.#started = true;
      this.assets.list().then(
        (entries) => this.#set(entries),
        () => this.#set([]),
      );
    }
    return () => {
      off();
      this.#listeners.delete(l);
    };
  };

  #set(entries: AssetEntry[] | null): void {
    this.#snapshot = { entries };
    for (const l of this.#listeners) l();
  }
}

function PlusIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

const LANE_OF: Readonly<Record<AssetKind, Lane>> = {
  video: "main",
  audio: "audio",
  image: "overlay",
};

/**
 * Loads the asset, then adds it at `at`, on `row` when the row is of the asset's lane (else the
 * model picks the track). A failed load shows on the asset's row in the panel.
 */
export async function addAt(
  session: EditorSession,
  id: string,
  at: Ticks,
  row: { id: string; lane: Lane } | null,
): Promise<void> {
  const info = await session.assets.load(id).catch(() => null);
  const history = session.history;
  if (!info || !history) return;
  const trackId = row && LANE_OF[info.kind] === row.lane ? row.id : null;
  session.run(addAsset(history.project, info, at, trackId));
}

export function AssetPanel(props: { session: EditorSession }): React.JSX.Element {
  const { session } = props;
  const t = useT(videoMessages);
  const [listing] = useState(() => new AssetListing(session.assets));
  const { entries } = useSyncExternalStore(listing.subscribe, listing.snapshot);
  const [query, setQuery] = useState("");
  const onDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.dataTransfer.setData(ASSET_MIME, id);
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const needle = query.trim().toLowerCase();
  const shown = (entries ?? []).filter((e) => e.name.toLowerCase().includes(needle));
  const addLabel = t("video.assets.add");

  return (
    <div className="fv-ve-ap">
      <h2 className="fv-ve-ap-title">{t("video.assets.title")}</h2>
      <input
        type="search"
        className="fv-ve-input"
        placeholder={t("video.assets.search")}
        aria-label={t("video.assets.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {entries && shown.length === 0 ? (
        <p className="fv-ve-ap-empty">{t("video.assets.empty")}</p>
      ) : null}
      <ul className="fv-ve-ap-list">
        {shown.map((entry) => {
          const status = session.assets.status(entry.id);
          return (
            <li key={entry.id} className="fv-ve-asset" data-kind={entry.kind}>
              <div
                className="fv-ve-asset-row"
                draggable
                onDragStart={(e) => onDragStart(e, entry.id)}
              >
                <span className="fv-ve-asset-name" title={entry.name}>
                  {entry.name}
                </span>
                {entry.id === SOURCE_ASSET_ID ? (
                  <span className="fv-ve-asset-tag">{t("video.assets.source")}</span>
                ) : null}
                <Tooltip content={addLabel}>
                  <Button
                    variant="ghost"
                    aria-label={addLabel}
                    icon={<PlusIcon />}
                    onClick={() => void addAt(session, entry.id, session.state.playhead, null)}
                  />
                </Tooltip>
              </div>
              {status.state === "loading" ? (
                <div className="fv-ve-loading">
                  <Progress label={t("video.clip.loading")} value={null} />
                </div>
              ) : null}
              {status.state === "unsupported" ? (
                <p className="fv-ve-asset-error">{t("video.clip.unsupported")}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
