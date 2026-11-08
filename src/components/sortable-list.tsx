"use client";

import { useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";

export type SortRow = { id: string; node: ReactNode };

/**
 * Reorderable list. Grab the grip handle (mouse or finger) and move over another row to swap places;
 * letting go reports the new order of ids. Pointer events, so it also works on touch screens.
 */
export function SortableList({
  rows, onReorder, label, className = "",
}: { rows: SortRow[]; onReorder: (ids: string[]) => void | Promise<void>; label: string; className?: string }) {
  const listRef = useRef<HTMLUListElement>(null);
  // Local order while dragging / until the server data catches up (only valid for the `rows` it was made from).
  const [local, setLocal] = useState<{ base: SortRow[]; ids: string[] } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const idsRef = useRef<string[]>([]);

  const order = local && local.base === rows ? local.ids : rows.map((r) => r.id);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const shown = order.map((id) => byId.get(id)).filter((r): r is SortRow => Boolean(r));

  const move = (e: React.PointerEvent<HTMLElement>, id: string) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-sortable-id]");
    if (!el || !listRef.current?.contains(el)) return;
    const overId = el.dataset.sortableId!;
    if (overId === id) return;
    const next = idsRef.current.filter((x) => x !== id);
    const at = next.indexOf(overId);
    const rect = el.getBoundingClientRect();
    const draggedFrom = idsRef.current.indexOf(id);
    const overIdx = idsRef.current.indexOf(overId);
    // moving down: land after the hovered row once past its middle; moving up: before it
    const after = draggedFrom < overIdx ? e.clientY > rect.top + rect.height / 2 : false;
    next.splice(after ? at + 1 : at, 0, id);
    if (next.join() === idsRef.current.join()) return;
    idsRef.current = next;
    setLocal({ base: rows, ids: next });
  };

  return (
    <ul ref={listRef} className={className}>
      {shown.map((r) => (
        <li key={r.id} data-sortable-id={r.id} className={`flex items-start gap-1 ${dragId === r.id ? "rounded-md bg-primary-soft/50 opacity-80" : ""}`}>
          <button
            type="button"
            aria-label={label}
            title={label}
            className="mt-1 flex h-10 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted hover:bg-surface-2 active:cursor-grabbing"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              idsRef.current = order;
              setDragId(r.id);
            }}
            onPointerMove={(e) => { if (dragId === r.id) move(e, r.id); }}
            onPointerUp={(e) => {
              e.currentTarget.releasePointerCapture(e.pointerId);
              setDragId(null);
              if (idsRef.current.join() !== rows.map((x) => x.id).join()) void onReorder(idsRef.current);
              else setLocal(null);
            }}
            onPointerCancel={() => { setDragId(null); setLocal(null); }}
          >
            <GripVertical size={16} />
          </button>
          <div className="min-w-0 flex-1">{r.node}</div>
        </li>
      ))}
    </ul>
  );
}
