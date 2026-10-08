export function hasVideoCodecs(): boolean {
  return typeof VideoDecoder === "function" && typeof VideoEncoder === "function";
}
