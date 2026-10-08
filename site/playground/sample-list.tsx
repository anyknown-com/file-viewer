import type { Locale } from "@anyknown/file-viewer";
import { SAMPLES, loadSample } from "./samples";
import { STRINGS } from "./strings";

export function SampleList({
  locale,
  onFile,
}: {
  locale: Locale;
  onFile: (file: File) => void;
}): React.JSX.Element {
  return (
    <div className="pg-samples">
      <span className="pg-samples-title">{STRINGS[locale].samples}</span>
      {SAMPLES.map((sample) => (
        <button
          key={sample.file}
          type="button"
          className="pg-button"
          data-sample={sample.file}
          onClick={() => void loadSample(sample).then(onFile)}
        >
          {sample.label[locale]}
        </button>
      ))}
    </div>
  );
}
