// The only class component in the package: React only lets a class be an error boundary.
import { Component, type ReactNode } from "react";
import { ViewerError } from "../contract/errors";

type Props = {
  fallback: (error: ViewerError) => ReactNode;
  report: (e: ViewerError) => void;
  children: ReactNode;
};
type State = { error: ViewerError | null };

export class Boundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(err: unknown): State {
    return {
      error: err instanceof ViewerError ? err : new ViewerError("render_failed", { cause: err }),
    };
  }

  componentDidCatch(): void {
    if (this.state.error) this.props.report(this.state.error);
  }

  render(): ReactNode {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
