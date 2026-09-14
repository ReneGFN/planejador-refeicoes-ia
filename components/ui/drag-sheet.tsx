import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PreviewIcons as I } from "./preview-icons";

export function DragSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const start = useRef<number | null>(null);
  const outsidePress = useRef(false);
  const isOutside = (node: HTMLDialogElement, x: number, y: number) => {
    const r = node.getBoundingClientRect();
    return x < r.left || x > r.right || y < r.top || y > r.bottom;
  };
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    return () => { node.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); else document.querySelector<HTMLElement>(".preview-screen h1")?.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="detail-dialog" aria-labelledby={titleId}
    onCancel={e => { e.preventDefault(); close.current(); }}
    onPointerDown={e => { outsidePress.current = e.button === 0 && e.target === e.currentTarget && isOutside(e.currentTarget, e.clientX, e.clientY); }}
    onPointerCancel={() => { outsidePress.current = false; }}
    onClick={e => {
      if (outsidePress.current && e.target === e.currentTarget && isOutside(e.currentTarget, e.clientX, e.clientY)) close.current();
      outsidePress.current = false;
    }}>
    <div className="detail-drag-handle" aria-hidden="true"
      onPointerDown={e => { start.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (start.current !== null) dialog.current!.style.transform = `translateY(${Math.max(0, e.clientY - start.current)}px)`; }}
      onPointerUp={e => { const delta = start.current === null ? 0 : e.clientY - start.current; start.current = null; dialog.current!.style.transform = ""; if (delta > 70) close.current(); }}
      onPointerCancel={() => { start.current = null; dialog.current!.style.transform = ""; }}><span /></div>
    <div className="detail-dialog-body"><div className="detail-dialog-heading"><h2 id={titleId}>{title}</h2>
      <button type="button" className="icon pressable" aria-label="Fechar painel" onClick={onClose}><I.x /></button></div>{children}</div>
  </dialog>, document.body);
}
