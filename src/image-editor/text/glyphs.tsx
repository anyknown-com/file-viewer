import { Icon, type IconSize } from "../../primitives/icon";

type GlyphProps = { size?: IconSize; label?: string };

export function TextIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <path d="M5 6V4h14v2" />
      <path d="M12 4v16" />
      <path d="M9 20h6" />
    </Icon>
  );
}

export function ShapeIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <rect x="3" y="3" width="11" height="11" rx="1" />
      <circle cx="15" cy="15" r="6" />
    </Icon>
  );
}

export function RectangleIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </Icon>
  );
}

export function EllipseIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <ellipse cx="12" cy="12" rx="8" ry="6" />
    </Icon>
  );
}

export function LineIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <path d="M5 19 19 5" />
    </Icon>
  );
}
