import { Icon, type IconSize } from "./icon";

type GlyphProps = { size?: IconSize; label?: string };

export function CloseIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

export function EditIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    </Icon>
  );
}

export function AlertIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </Icon>
  );
}

export function FileIcon(props: GlyphProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </Icon>
  );
}
