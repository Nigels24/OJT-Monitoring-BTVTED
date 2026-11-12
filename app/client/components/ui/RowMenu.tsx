"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LucideIcon, MoreHorizontal } from "lucide-react";
import { Z_LAYERS } from "./Overlay";

export interface RowMenuItem {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Red text, for a destructive action such as Delete. */
  danger?: boolean;
}

interface RowMenuProps {
  /** Names the trigger for screen readers ("More actions for Juan Dela Cruz"). */
  label: string;
  items: RowMenuItem[];
}

const MENU_WIDTH = 176;

/**
 * A "⋯" button that opens the less-used actions of a table row.
 *
 * The menu portals to `document.body` and is placed with `position: fixed`
 * from the trigger's rectangle: inside `DataTable`'s `overflow-x-auto`
 * wrapper an absolutely positioned menu would be clipped (see `Z_LAYERS`).
 * It closes on an outside click, Escape, a scroll or a resize — a fixed menu
 * left open while the table scrolls would float away from its row.
 */
export default function RowMenu({ label, items }: RowMenuProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const open = position !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setPosition(null);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (open) {
      setPosition(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    // Right-aligned under the trigger, kept inside the viewport's gutter.
    const left = Math.max(
      8,
      Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8),
    );
    setPosition({ top: rect.bottom + 4, left });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title="More actions"
        className="p-1 md:p-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
      >
        <MoreHorizontal size={14} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={id}
            role="menu"
            className="fixed rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            style={{
              top: position.top,
              left: position.left,
              width: MENU_WIDTH,
              zIndex: Z_LAYERS.dropdown,
            }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setPosition(null);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                  item.danger ? "text-red-600" : "text-gray-700"
                }`}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
