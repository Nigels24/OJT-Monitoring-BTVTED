"use client";

import PrintPage from "@/components/ui/PrintPage";
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
 * The toolbar and the A4 frame are `PrintPage` (`components/ui`), shared with
 * the Weekly Task Report.
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
    <PrintPage
      backHref={backHref}
      backLabel={backLabel}
      canPrint={!!evaluation}
      framed={!isLoading && !!evaluation}
    >
      {isLoading ? (
        <p className="text-sm text-gray-500 py-12 text-center">
          Loading the evaluation sheet...
        </p>
      ) : !evaluation ? (
        <div className="bg-white rounded-lg p-8 text-center">
          <p className="text-sm text-gray-700">
            This evaluation sheet is not available. It may have been deleted, or
            it is not one you have access to.
          </p>
        </div>
      ) : (
        <EvaluationPrintSheet evaluation={evaluation} />
      )}
    </PrintPage>
  );
}
