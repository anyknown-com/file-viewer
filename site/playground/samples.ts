// The sample files the playground offers. They live in site/public/samples/ and are fetched from
// the site's own origin, so opening one sends no request anywhere else.
import type { Locale, ViewKind } from "@anyknown/file-viewer";
import samples from "../public/samples/samples.json";

export type Sample = {
  file: string;
  mime: string;
  view: ViewKind;
  expect: string;
  label: Record<Locale, string>;
};

export const SAMPLES = samples as Sample[];

export async function loadSample(sample: Sample): Promise<File> {
  const response = await fetch("/samples/" + sample.file);
  const blob = await response.blob();
  return new File([blob], sample.file, { type: sample.mime });
}
