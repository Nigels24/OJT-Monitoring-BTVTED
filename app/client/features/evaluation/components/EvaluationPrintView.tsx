"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Evaluation } from "@/lib/api/evaluationApi";
import EvaluationPrintSheet from "./EvaluationPrintSheet";

interface EvaluationPrintViewProps {
  /** `undefined` while loading, or when this role cannot see the sheet. */
  evaluation: Evaluation | undefined;
  isLoading: boolean;
  /** Where "Back" goes — each role's own page. */
  backHref: string;
  backLabel: string;
}

/**
 * The print view of one evaluation sheet, shared by all three roles.
 *
 * The page is the sheet and nothing else: no sidebar to hide, only this
 * toolbar, which is `print:hidden`. Paper size and margins come from the
 * `@media print` block in `app/globals.css`. On screen the sheet is shown at
 * A4 width so what is previewed is what prints.
 *
 * Which sheets a role may open is decided by the server — each page fetches
 * through its own role's endpoint, and a sheet that endpoint does not return
 * lands on the "not available" state below.
 */
export default function EvaluationPrintView({
  evaluation,
  isLoading,
  backHref,
  backLabel,
}: EvaluationPrintViewProps) {
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
            disabled={!evaluation}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60"
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-[210mm] p-4 print:max-w-none print:p-0">
        {isLoading ? (
          <p className="text-sm text-gray-500 py-12 text-center">
            Loading the evaluation sheet...
          </p>
        ) : !evaluation ? (
          <div className="bg-white rounded-lg p-8 text-center">
            <p className="text-sm text-gray-700">
              This evaluation sheet is not available. It may have been deleted,
              or it is not one you have access to.
            </p>
          </div>
        ) : (
          <div className="bg-white shadow-sm p-[15mm] print:shadow-none print:p-0">
            <EvaluationPrintSheet evaluation={evaluation} />
          </div>
        )}
      </main>
    </div>
  );
}
