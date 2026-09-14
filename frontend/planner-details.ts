type Sheet = HTMLElement & { snapToPoint: (index: number, options: { behavior: ScrollBehavior }) => void };

export function installPlannerDrag() {
  const sheet = document.getElementById("meal-sheet") as Sheet | null;
  const handle = document.getElementById("planner-drag-handle");
  if (!sheet || !handle) return;
  const backdrop = document.createElement("div");
  backdrop.className = "planner-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  sheet.before(backdrop);
  // Use the existing close action so drafts and focus restoration stay intact.
  const dismiss = () => document.getElementById("close")?.click();
  let outsidePress = false;
  backdrop.addEventListener("pointerdown", e => { outsidePress = e.button === 0; });
  backdrop.addEventListener("pointercancel", () => { outsidePress = false; });
  backdrop.addEventListener("click", () => { if (outsidePress && !sheet.hidden) dismiss(); outsidePress = false; });
  document.addEventListener("pointerup", e => { if (e.target !== backdrop) outsidePress = false; });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !sheet.hidden && !document.querySelector("dialog[open]")) {
      e.preventDefault(); dismiss();
    }
  });
  let start: number | null = null;
  let suppressClick = false;
  const reset = () => { start = null; sheet.style.translate = ""; };
  handle.addEventListener("pointerdown", e => { if (e.button !== 0) return; start = e.clientY; suppressClick = false; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener("pointermove", e => { if (start === null) return; const dy = e.clientY - start; if (Math.abs(dy) > 8) suppressClick = true; sheet.style.translate = `0 ${Math.max(-24, Math.min(100, dy))}px`; });
  handle.addEventListener("pointerup", e => {
    if (start === null) return;
    const dy = e.clientY - start; reset();
    const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    if (dy < -45) sheet.snapToPoint(3, { behavior });
    else if (dy > 70) { if (sheet.dataset.sheetState === "expanded") sheet.snapToPoint(1, { behavior }); else document.getElementById("close")?.click(); }
  });
  handle.addEventListener("pointercancel", reset);
  handle.addEventListener("click", () => { if (!suppressClick) document.getElementById("toggle")?.click(); suppressClick = false; });
}
