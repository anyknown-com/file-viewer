import { Icon, type IconSize } from "../primitives/icon";

type GlyphProps = { size?: IconSize; label?: string };

export function UndoIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </Icon>
  );
}

export function RedoIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </Icon>
  );
}

export function PlayIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M7 4v16l13-8z" />
    </Icon>
  );
}

export function PauseIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 5v14M16 5v14" />
    </Icon>
  );
}

export function LoopIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </Icon>
  );
}

export function ToStartIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6 5v14" />
      <path d="M19 5v14L9 12z" />
    </Icon>
  );
}

export function ToEndIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M18 5v14" />
      <path d="M5 5v14l10-7z" />
    </Icon>
  );
}

export function DeleteIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m6 6 1 14h10l1-14" />
    </Icon>
  );
}

export function KeepIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6 3v18M18 3v18" />
      <path d="M10 12h4" />
    </Icon>
  );
}

export function SplitIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12 3v18" />
      <path d="m8 8-4 4 4 4M16 8l4 4-4 4" />
    </Icon>
  );
}

export function FadeInIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 20 21 4v16z" />
    </Icon>
  );
}

export function FadeOutIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M21 20 3 4v16z" />
    </Icon>
  );
}

export function VolumeIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
    </Icon>
  );
}

export function NormalizeIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 12h2M7 8v8M11 4v16M15 8v8M19 10v4" />
    </Icon>
  );
}

export function SilenceIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 12h18" />
      <path d="m9 8 6 8M15 8l-6 8" />
    </Icon>
  );
}
