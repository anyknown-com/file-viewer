import { useState, type DragEvent, type ReactNode } from "react";

export function DropZone({
  onFile,
  children,
}: {
  onFile: (file: File) => void;
  children: ReactNode;
}): React.JSX.Element {
  const [dragging, setDragging] = useState(false);
  const over = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };
  return (
    <div
      className="pg-zone"
      data-dragging={dragging ? "" : undefined}
      onDragEnter={over}
      onDragOver={over}
      onDragLeave={(e) => {
        // Moving between children fires dragleave too; only leaving the zone itself counts.
        if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) {
          setDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      {children}
    </div>
  );
}
