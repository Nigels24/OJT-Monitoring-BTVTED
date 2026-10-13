"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useGetCoordinatorWeekQuery } from "@/lib/api/weeklyTaskApi";
import WeeklyTaskReportView from "@/features/weekly-tasks/components/WeeklyTaskReportView";

/**
 * Coordinator: one placement's Weekly Task Report, ready to print —
 * `?assignment=<id>&week=<yyyy-mm-dd>`.
 *
 * Read-only, with the same reach as the coordinator's other reads.
 */
export default function CoordinatorWeeklyTaskReportPage() {
  return (
    <Suspense fallback={null}>
      <CoordinatorWeeklyTaskReport />
    </Suspense>
  );
}

function CoordinatorWeeklyTaskReport() {
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("assignment") ?? "";
  const week = searchParams.get("week") ?? undefined;
  const { data, isLoading } = useGetCoordinatorWeekQuery(
    { assignmentId, week },
    { skip: !assignmentId },
  );

  return (
    <WeeklyTaskReportView
      report={data}
      isLoading={isLoading}
      backHref="/coordinator/students"
      backLabel="Back to students"
    />
  );
}
