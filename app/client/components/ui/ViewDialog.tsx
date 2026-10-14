"use client";

import { LucideIcon, X } from "lucide-react";
import Overlay from "./Overlay";

interface ViewDialogProps {
  open: boolean;
  title: string;
  icon?: LucideIcon;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Read-only content in a modal. A backdrop click closes it — there is nothing
 * to lose — which is the one thing that separates it from `FormDialog`.
 */
export default function ViewDialog({
  open,
  title,
  icon: Icon,
  onClose,
  children,
}: ViewDialogProps) {
  return (
    <Overlay open={open} label={title} onClose={onClose}>
      <div className="bg-white rounded-2xl p-4 md:p-6 max-w-2xl w-full max-h-[90dvh] overflow-auto">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && <Icon size={24} className="shrink-0 text-blue-600" />}
            <h2 className="text-lg md:text-xl font-bold text-gray-800 break-words min-w-0">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">{children}</div>
      </div>
    </Overlay>
  );
}
