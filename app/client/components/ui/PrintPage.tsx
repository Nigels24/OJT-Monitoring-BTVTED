"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

interface PrintPageProps {
  /** Where "Back" goes — each role's own page. */
  backHref: string;
  backLabel: string;
  /** False while there is nothing to print yet (loading, or not available). */
  canPrint: boolean;
  /**
   * The sheet, or a loading / not-available message. `framed` puts it on the
   * white A4 page; leave it off for a message.
   */
  framed: boolean;
  children: React.ReactNode;
}

/**
 * The shell of every printable page: a toolbar that is `print:hidden`, and the
 * sheet shown at A4 width so what is previewed is what prints.
 *
 * There is no sidebar to hide — a print route is the sheet and nothing else.
 * Paper size and margins come from the `@media print` block in
 * `app/globals.css`, which is the one print stylesheet every sheet shares.
 */
export default function PrintPage({
  backHref,
  backLabel,
  canPrint,
  framed,
  children,
}: PrintPageProps) {
  return (
    <div className="min-h-screen bg-gray-100 print:min-h-0 print:bg-white">
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="mx-auto max-w-[210mm] px-4 py-3 flex items-center justify-between gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <ArrowLeft size={16} />
            {backLabel}
          </Link>
          <button
            type="button"
            onClick={() => {
              window.print();
            }}
            disabled={!canPrint}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60"
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </div>

      {/* An A4 sheet is wider than a phone: it scrolls sideways inside this
          frame on screen, and is untouched on paper. */}
      <main className="mx-auto max-w-[210mm] p-4 overflow-x-auto print:overflow-visible print:max-w-none print:p-0">
        {framed ? (
          <div className="bg-white shadow-sm p-4 sm:p-[15mm] print:shadow-none print:p-0">
            {children}
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
