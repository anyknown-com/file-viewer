import { kindOf } from "@anyknown/file-viewer";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { SAMPLES } from "./samples";

const DIR = join(process.cwd(), "site/public/samples");

it("lists every sample file and only existing ones", () => {
  const onDisk = readdirSync(DIR).filter((f) => f !== "samples.json");
  expect(SAMPLES.map((s) => s.file).toSorted()).toEqual(onDisk.toSorted());
});

it("keeps the samples under 2 MiB in total", () => {
  const total = SAMPLES.reduce((sum, s) => sum + statSync(join(DIR, s.file)).size, 0);
  expect(total).toBeLessThanOrEqual(2 * 1024 * 1024);
});

it.each(SAMPLES)("$file opens as $view and is labelled", (sample) => {
  const size = statSync(join(DIR, sample.file)).size;
  expect(kindOf({ name: sample.file, mime: sample.mime, size }).view).toBe(sample.view);
  expect(sample.label.en).not.toBe("");
  expect(sample.label["zh-TW"]).not.toBe("");
  expect(sample.expect).not.toBe("");
});
