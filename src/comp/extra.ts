import { z } from "zod";

type Extra = { extra?: Record<string, unknown> };

/**
 * An object schema that keeps keys it does not know in `extra`, so fields a newer Compositor adds
 * (its "Additive layer fields", which do not bump the version) survive a load and save here.
 */
export function record<S extends z.ZodRawShape>(shape: S) {
  const known = new Set(Object.keys(shape));
  return z.looseObject(shape).transform((value) => {
    const out: Record<string, unknown> = {};
    const extra: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (known.has(key)) out[key] = v;
      else extra[key] = v;
    }
    if (Object.keys(extra).length > 0) out.extra = extra;
    return out as z.output<z.ZodObject<S>> & Extra;
  });
}

/**
 * A Swift `T?` field. Synthesized Decodable uses decodeIfPresent, which reads a missing key and
 * `null` alike as nil; both become `undefined` here, and the key is left out when written.
 */
export function optional<T extends z.ZodType>(schema: T) {
  return schema
    .nullish()
    .transform((v) => v ?? undefined)
    .optional();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Turns parsed records back into plain JSON: `extra` merged in (known fields win), `undefined` dropped, keys sorted. */
export function toJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (!isPlainObject(value)) return value;
  const { extra, ...known } = value;
  const merged: Record<string, unknown> = { ...(isPlainObject(extra) ? extra : {}), ...known };
  const out: Record<string, unknown> = {};
  const keys = Object.keys(merged);
  keys.sort(); // toSorted is ES2023; ./comp targets ES2022
  for (const key of keys) {
    if (merged[key] !== undefined) out[key] = toJsonValue(merged[key]);
  }
  return out;
}
