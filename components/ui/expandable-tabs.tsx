"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "framer-motion";
import { useOnClickOutside } from "usehooks-ts";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabItem = {
  title: string;
  icon: LucideIcon;
  type?: never;
  href?: string;
  controls?: string;
  expanded?: boolean;
} | { type: "separator"; title?: never; icon?: never };

export interface ExpandableTabsProps {
  tabs: TabItem[];
  className?: string;
  activeColor?: string;
  /** Current destination is independent of the temporarily expanded label. */
  activeIndex?: number | null;
  persistentLabels?: boolean;
  onChange?: (index: number | null) => void;
}

const buttonVariants = {
  animate: (expanded: boolean) => ({
    paddingLeft: expanded ? 16 : 11,
    paddingRight: expanded ? 16 : 11,
  }),
};
const spanVariants = {
  initial: { width: 0, opacity: 0 },
  animate: { width: "auto", opacity: 1 },
  exit: { width: 0, opacity: 0 },
};

export function ExpandableTabs({ tabs, className, activeColor = "text-primary", activeIndex, persistentLabels = false, onChange }: ExpandableTabsProps) {
  const [selected, setSelected] = React.useState<number | null>(activeIndex ?? null);
  const outsideClickRef = React.useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const highlightId = React.useId();
  const transition: Transition = reducedMotion
    ? { duration: 0 }
    : { type: "spring", bounce: 0, duration: 0.32 };
  const collapse = () => { setSelected(null); onChange?.(null); };
  // usehooks-ts 3 types predate React 19's nullable refs; its implementation guards current.
  const hookRef = outsideClickRef as React.RefObject<HTMLDivElement>;
  useOnClickOutside(hookRef, collapse);
  useOnClickOutside(hookRef, collapse, "touchstart");
  useOnClickOutside(hookRef, collapse, "focusin");

  React.useEffect(() => { setSelected(activeIndex ?? null); }, [activeIndex]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { collapse(); return; }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-tab-item]")];
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div ref={outsideClickRef} onKeyDown={handleKeyDown}
      className={cn("expandable-tabs flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-background p-1 shadow-sm", className)}>
      {tabs.map((tab, index) => {
        if (tab.type === "separator") return <div key={`separator-${index}`} className="mx-1 h-6 w-px bg-border" aria-hidden="true" />;
        const Icon = tab.icon;
        const current = (activeIndex === undefined ? selected : activeIndex) === index;
        const shared = {
          "data-tab-item": true,
          "data-current": current,
          "aria-label": tab.title,
          "aria-current": current && !tab.controls ? "page" as const : undefined,
          "aria-controls": tab.controls,
          "aria-expanded": tab.expanded,
          variants: persistentLabels ? undefined : buttonVariants,
          initial: false as const,
          animate: "animate",
          custom: selected === index,
          transition,
          onFocus: () => setSelected(index),
          onClick: (event: React.MouseEvent<HTMLElement>) => {
            if (tab.href && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
            setSelected(index); onChange?.(index);
          },
          className: cn("expandable-tab relative flex shrink-0 items-center rounded-xl py-2 text-sm font-medium transition-colors duration-150",
            current ? cn("bg-transparent", activeColor) : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"),
        };
        const children = <>
          {current && <motion.span className="tab-selection-highlight" aria-hidden="true" layoutId={reducedMotion ? undefined : highlightId} transition={transition} />}
          <Icon size={22} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
          {persistentLabels ? <span className="tab-label" aria-hidden="true">{tab.title}</span> : <AnimatePresence initial={false}>
            {selected === index && <motion.span variants={spanVariants} initial="initial" animate="animate" exit="exit"
              transition={transition} className="overflow-hidden whitespace-nowrap" aria-hidden="true"><span className="block pl-2">{tab.title}</span></motion.span>}
          </AnimatePresence>}
        </>;
        return tab.href
          ? <motion.a key={tab.title} href={tab.href} {...shared}>{children}</motion.a>
          : <motion.button key={tab.title} type="button" {...shared}>{children}</motion.button>;
      })}
    </div>
  );
}
