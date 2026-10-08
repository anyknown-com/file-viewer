import { useT } from "../../../i18n/use-t";
import { Select } from "../../../primitives/select";
import { adjustMessages } from "../messages";

export const CHANNELS = ["RGB", "Red", "Green", "Blue"] as const;
export type Channel = (typeof CHANNELS)[number];

export function channelIndex(c: Channel): number {
  return CHANNELS.indexOf(c);
}

export function ChannelSelect(props: {
  value: Channel;
  onChange: (c: Channel) => void;
}): React.JSX.Element {
  const t = useT(adjustMessages);
  const names = {
    RGB: t("image.adjust.channel.rgb"),
    Red: t("image.adjust.channel.red"),
    Green: t("image.adjust.channel.green"),
    Blue: t("image.adjust.channel.blue"),
  } satisfies Record<Channel, string>;
  const label = (c: Channel) => names[c];
  return (
    <Select
      label={t("image.adjust.channel")}
      value={props.value}
      groups={[CHANNELS.map((c) => ({ value: c, label: label(c) }))]}
      onChange={props.onChange}
    />
  );
}
