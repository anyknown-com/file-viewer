// The image editor's inline SVG icons (24 × 24, stroked), wrapped in 02's Icon.
import { Icon, type IconSize } from "../primitives/icon";

type GlyphProps = { size?: IconSize; label?: string };

export function UndoIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 010 10h-3" />
    </Icon>
  );
}

export function RedoIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9a5 5 0 000 10h3" />
    </Icon>
  );
}

export function EyeIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function EyeOffIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.4 10.4 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4.2M6.6 6.6A17 17 0 002 12s3.5 7 10 7a9.7 9.7 0 005.4-1.6" />
    </Icon>
  );
}

export function PlusIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function FolderIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1z" />
    </Icon>
  );
}

export function FolderPlusIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1z" />
      <path d="M12 10v6M9 13h6" />
    </Icon>
  );
}

export function MaskIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <circle cx="12" cy="12" r="4" />
    </Icon>
  );
}

export function TrashIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </Icon>
  );
}

export function ChevronIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}

export function ChevronDownIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  );
}

/** The bent arrow a clipped layer shows, pointing down at its base. */
export function ClipArrowIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6 4v9a3 3 0 003 3h9" />
      <path d="M14 12l4 4-4 4" />
    </Icon>
  );
}

/** Move / transform: a four-way arrow. */
export function MoveIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12 3v18M3 12h18" />
      <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </Icon>
  );
}

export function HandIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 13V5.5a1.5 1.5 0 013 0V11M11 10.5v-7a1.5 1.5 0 013 0V11M14 10.5V5a1.5 1.5 0 013 0v6" />
      <path d="M17 8.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1.5a6 6 0 01-4.6-2.2L4.6 15a1.5 1.5 0 012.3-2l1.1 1.2" />
    </Icon>
  );
}

export function ZoomIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6" />
    </Icon>
  );
}

export function CropIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6 2v14a2 2 0 002 2h14" />
      <path d="M2 6h14a2 2 0 012 2v14" />
    </Icon>
  );
}
