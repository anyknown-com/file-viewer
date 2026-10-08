import { useState, type DragEvent, type ReactNode } from "react";

export function DropZone({
  onFiles,
  children,
}: {
  onFiles: (files: File[]) => void;
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
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onFiles(files);
      }}
    >
      {children}
    </div>
  );
}
