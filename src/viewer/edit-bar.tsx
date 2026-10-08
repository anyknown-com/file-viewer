import { commonMessages } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { Button } from "../primitives/button";

export function EditBar(props: { onEdit: () => void }): React.JSX.Element {
  const tc = useT(commonMessages);
  return (
    <div className="fv-bar">
      <Button onClick={props.onEdit}>{tc("common.edit")}</Button>
    </div>
  );
}
