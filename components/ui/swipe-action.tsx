import { useRef, useState, type ReactNode } from "react";
import { PreviewIcons as I } from "./preview-icons";

/** Swipe reveals an action, never performs it. A visible button provides the keyboard alternative. */
export function SwipeAction({ children, label, onAction }: { children: ReactNode; label: string; onAction: () => void }) {
  const [open, setOpen] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; base: number; delta: number; captured: boolean } | null>(null);
  const suppressClick = useRef(false);
  function reset(next: boolean) { setOpen(next); track.current!.style.transform = next ? "translateX(-76px)" : ""; track.current!.classList.remove("dragging"); gesture.current = null; }
  return <div className="swipe-row">
    <button type="button" className="swipe-revealed" tabIndex={open ? 0 : -1} aria-hidden={!open} aria-label={label} onClick={() => { reset(false); onAction(); }}><I.trash size={20} /></button>
    <div ref={track} className="swipe-row-track"
      onPointerDown={e => { if (e.button !== 0 || (e.target as HTMLElement).closest("button,a,input,label,textarea,select")) return; suppressClick.current = false; gesture.current = { x: e.clientX, y: e.clientY, base: open ? -76 : 0, delta: 0, captured: false }; }}
      onPointerMove={e => {
        const g = gesture.current; if (!g) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        if (!g.captured) { if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { gesture.current = null; return; } if (Math.abs(dx) < 8) return;
          e.currentTarget.setPointerCapture(e.pointerId); g.captured = true; suppressClick.current = true; e.currentTarget.classList.add("dragging"); }
        g.delta = Math.min(0, Math.max(-92, g.base + dx)); e.currentTarget.style.transform = `translateX(${g.delta}px)`;
      }}
      onPointerUp={() => { const g = gesture.current; if (g) reset(g.captured ? g.delta < -38 : open); }}
      onPointerCancel={() => reset(open)}
      onClickCapture={e => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; } }}>
      {children}<button type="button" className="text-action swipe-alternative" onClick={onAction}><I.trash size={16} />{label}</button>
    </div>
  </div>;
}
