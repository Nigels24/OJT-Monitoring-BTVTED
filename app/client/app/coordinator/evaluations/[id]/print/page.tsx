"use client";

import { useParams } from "next/navigation";
import { useGetAllEvaluationsQuery } from "@/lib/api/evaluationApi";
import EvaluationPrintView from "@/features/evaluation/components/EvaluationPrintView";

/**
 * Coordinator: one evaluation sheet, ready to print.
 *
 * Read out of the same list the Evaluations page already holds, so arriving
 * from there costs no request.
 */
export default function CoordinatorEvaluationPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { evaluation, isLoading } = useGetAllEvaluationsQuery(undefined, {
    selectFromResult: ({ data, isLoading }) => ({
      evaluation: data?.find((row) => row.id === id),
      isLoading,
    }),
  });

  return (
    <EvaluationPrintView
      evaluation={evaluation}
      isLoading={isLoading}
      backHref="/coordinator/evaluations"
      backLabel="Back to evaluations"
    />
  );
}
