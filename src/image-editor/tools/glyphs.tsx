import { Icon, type IconSize } from "../../primitives/icon";

type GlyphProps = { size?: IconSize; label?: string };

export function RectMarqueeGlyph(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <rect x="4" y="5" width="16" height="14" strokeDasharray="3 3" />
    </Icon>
  );
}

export function EllipseMarqueeGlyph(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <ellipse cx="12" cy="12" rx="8" ry="7" strokeDasharray="3 3" />
    </Icon>
  );
}

export function LassoGlyph(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <path d="M4 10c0-3 4-5 8-5s8 2 8 5-4 5-8 5c-1 0-2 0-3-.3" />
      <path d="M9 14.7c-1 1.5-1 3.3 1 4.3 1.5.7 3 .2 3.5-1" />
    </Icon>
  );
}

export function PolygonLassoGlyph(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <path d="M4 17 7 6l8 3 5 7-7 3z" strokeDasharray="3 3" />
    </Icon>
  );
}

export function WandGlyph(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <path d="m4 20 10-10" />
      <path d="m13 4 .8 2.2L16 7l-2.2.8L13 10l-.8-2.2L10 7l2.2-.8z" />
      <path d="m18 12 .5 1.5L20 14l-1.5.5L18 16l-.5-1.5L16 14l1.5-.5z" />
    </Icon>
  );
}

export function BrushGlyph(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <path d="m15 4 5 5-8 8-5-5z" />
      <path d="M7 12c-2 0-3 1.5-3 4 0 2 1 3 3 4 3 0 4-2 4-3" />
    </Icon>
  );
}

export function EraserGlyph(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <path d="m8 20-4-4 11-11 5 5L11 20z" />
      <path d="m9 8 7 7" />
      <path d="M11 20h9" />
    </Icon>
  );
}

export function CloneGlyph(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <path d="M9 12h6" />
      <path d="M10 12V6a2 2 0 0 1 4 0v6" />
      <path d="M6 12h12v3H6z" />
      <path d="M7 15v4h10v-4" />
    </Icon>
  );
}

export function HealGlyph(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)" />
      <path d="m10 10 4 4" />
    </Icon>
  );
}

export function GradientGlyph(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <path d="M8 5v14M12 5v14M16 5v14" strokeDasharray="1 3" />
    </Icon>
  );
}

export function EyedropperGlyph(props: GlyphProps): React.JSX.Element {
  return (
    <Icon size={props.size} label={props.label}>
      <path d="m15 4 5 5-3 1-5-5z" />
      <path d="m12 7-8 8v5h5l8-8" />
      <path d="m17 7 1.5-1.5" />
    </Icon>
  );
}
