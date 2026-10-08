export function Spinner(props: { label: string }): React.JSX.Element {
  return <output className="fv-spinner" aria-label={props.label} />;
}
