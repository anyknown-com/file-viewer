// The playground: drop or pick a file, view and edit it with FileViewer, save as a download.
// Self-contained: it imports only the published package, Base UI, React and files in this folder,
// so a standalone tool page can mount the same component later.
import { FileViewer, type FileRef, type Locale, type SaveRequest } from "@anyknown/file-viewer";
import { useRef, useState } from "react";
import { DiscardDialog } from "./discard-dialog";
import { DropZone } from "./drop-zone";
import { downloadSave, fileRefOf, savedRefOf } from "./host";
import "./playground.css";
import { SampleList } from "./sample-list";
import { STRINGS, formatSize } from "./strings";

type Opened = { ref: FileRef; size: number; key: number };

export function Playground({
  locale,
  theme,
}: {
  locale: Locale;
  theme?: "light" | "dark";
}): React.JSX.Element {
  const strings = STRINGS[locale];
  const [opened, setOpened] = useState<Opened | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const nextKey = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  const show = (ref: FileRef, size: number) => {
    nextKey.current += 1;
    setOpened({ ref, size, key: nextKey.current });
    setDirty(false);
  };
  const guard = (action: () => void) => {
    if (dirty) setPending(() => action);
    else action();
  };
  const open = (file: File) => guard(() => show(fileRefOf(file), file.size));
  const close = () =>
    guard(() => {
      setOpened(null);
      setDirty(false);
    });
  const save = async (req: SaveRequest) => {
    await downloadSave(req);
    if (req.mode === "replace") show(savedRefOf(req), req.blob.size);
  };

  const chooseButton = (
    <button type="button" className="pg-button" onClick={() => input.current?.click()}>
      {strings.choose}
    </button>
  );

  return (
    <DropZone onFile={open}>
      <input
        ref={input}
        type="file"
        hidden
        data-playground-input
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) open(file);
        }}
      />
      {opened ? (
        <div className="pg-opened">
          <div className="pg-toolbar">
            <span className="pg-file">
              <span className="pg-name">{opened.ref.name}</span>
              <span className="pg-meta">
                {" · "}
                {formatSize(opened.size, locale)}
                {" · "}
                {strings.local}
              </span>
            </span>
            <span className="pg-actions">
              {chooseButton}
              <button type="button" className="pg-button" onClick={close}>
                {strings.close}
              </button>
            </span>
          </div>
          <SampleList locale={locale} onFile={open} />
          <div className="pg-viewer">
            <FileViewer
              key={opened.key}
              file={opened.ref}
              locale={locale}
              theme={theme}
              excalidraw={{ assetPath: "/excalidraw-assets/" }}
              onSave={save}
              onDirtyChange={setDirty}
            />
          </div>
        </div>
      ) : (
        <div className="pg-drop">
          <p className="pg-drop-title">{strings.drop}</p>
          <p className="pg-drop-hint">{strings.dropHint}</p>
          {chooseButton}
        </div>
      )}
      {opened ? null : <SampleList locale={locale} onFile={open} />}
      <DiscardDialog
        open={pending !== null}
        name={opened?.ref.name ?? ""}
        strings={strings}
        onKeep={() => setPending(null)}
        onDiscard={() => {
          pending?.();
          setPending(null);
        }}
      />
    </DropZone>
  );
}
