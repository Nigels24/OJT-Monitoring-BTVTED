"use client";

import { useParams } from "next/navigation";
import { useGetMyEvaluationsQuery } from "@/lib/api/evaluationApi";
import EvaluationPrintView from "@/features/evaluation/components/EvaluationPrintView";

/**
 * Supervisor: one evaluation sheet, ready to print.
 *
 * Read out of the supervisor's own list (`GET /supervisor/evaluations`), so
 * the sheets that can be printed here are exactly the ones that list shows —
 * the server decides, and any other id finds nothing.
 */
export default function SupervisorEvaluationPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { evaluation, isLoading } = useGetMyEvaluationsQuery(undefined, {
    selectFromResult: ({ data, isLoading }) => ({
      evaluation: data?.find((row) => row.id === id),
      isLoading,
    }),
  });

  return (
    <EvaluationPrintView
      evaluation={evaluation}
      isLoading={isLoading}
      backHref="/supervisor/evaluation"
      backLabel="Back to evaluations"
    />
  );
}
