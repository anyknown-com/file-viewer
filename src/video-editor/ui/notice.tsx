import type { ViewerErrorCode } from "../../contract/errors";
import { useT } from "../../i18n/use-t";
import { Button } from "../../primitives/button";
import { AlertIcon } from "../../primitives/glyphs";
import { videoMessages } from "../messages";

export type NoticeReason = "noWebCodecs" | "narrow" | "codec" | "readFailed";

export function noticeReason(code: ViewerErrorCode): Exclude<NoticeReason, "narrow"> {
  if (code === "webcodecs_unavailable") return "noWebCodecs";
  if (code === "read_failed") return "readFailed";
  return "codec";
}

export function Notice(props: { reason: NoticeReason; onBack(): void }): React.JSX.Element {
  const t = useT(videoMessages);
  return (
    <div className="fv-ve-notice">
      <AlertIcon size="lg" />
      <p>{t(`video.notice.${props.reason}`)}</p>
      <Button onClick={props.onBack}>{t("video.notice.back")}</Button>
    </div>
  );
}
