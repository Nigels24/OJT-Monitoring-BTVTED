"use client";

import { useParams } from "next/navigation";
import { useGetMyEvaluationQuery } from "@/lib/api/studentPortalApi";
import EvaluationPrintView from "@/features/evaluation/components/EvaluationPrintView";

/**
 * Student: one of their own evaluation sheets, ready to print.
 *
 * `GET /student/evaluations/:id` answers only for the signed-in student's own
 * sheets; anyone else's id is refused there, not here.
 */
export default function StudentEvaluationPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { data: evaluation, isLoading } = useGetMyEvaluationQuery(id);

  return (
    <EvaluationPrintView
      evaluation={evaluation}
      isLoading={isLoading}
      backHref="/student/dashboard"
      backLabel="Back to dashboard"
    />
  );
}
