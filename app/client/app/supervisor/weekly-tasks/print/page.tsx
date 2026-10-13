"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useGetSupervisorWeekQuery } from "@/lib/api/weeklyTaskApi";
import WeeklyTaskReportView from "@/features/weekly-tasks/components/WeeklyTaskReportView";

/**
 * Supervisor: one placement's Weekly Task Report, ready to print —
 * `?assignment=<id>&week=<yyyy-mm-dd>`.
 *
 * A placement at another establishment is refused by the server, not here.
 */
export default function SupervisorWeeklyTaskReportPage() {
  return (
    <Suspense fallback={null}>
      <SupervisorWeeklyTaskReport />
    </Suspense>
  );
}

function SupervisorWeeklyTaskReport() {
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("assignment") ?? "";
  const week = searchParams.get("week") ?? undefined;
  const { data, isLoading } = useGetSupervisorWeekQuery(
    { assignmentId, week },
    { skip: !assignmentId },
  );

  return (
    <WeeklyTaskReportView
      report={data}
      isLoading={isLoading}
      backHref="/supervisor/weekly-tasks"
      backLabel="Back to weekly tasks"
    />
  );
}
