import { Progress as BaseProgress } from "@base-ui/react/progress";

export function Progress(props: { label: string; value: number | null }): React.JSX.Element {
  return (
    <BaseProgress.Root
      value={props.value}
      min={0}
      max={1}
      aria-label={props.label}
      className="fv-progress"
    >
      <BaseProgress.Track className="fv-progress-track">
        <BaseProgress.Indicator className="fv-progress-indicator" />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
