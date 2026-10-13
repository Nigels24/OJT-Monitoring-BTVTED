"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useGetMyWeekQuery } from "@/lib/api/weeklyTaskApi";
import WeeklyTaskReportView from "@/features/weekly-tasks/components/WeeklyTaskReportView";

/**
 * Student: one placement's Weekly Task Report, ready to print —
 * `?assignment=<id>&week=<yyyy-mm-dd>`.
 *
 * Another student's placement is refused by the server, not here.
 */
export default function StudentWeeklyTaskReportPage() {
  return (
    <Suspense fallback={null}>
      <StudentWeeklyTaskReport />
    </Suspense>
  );
}

function StudentWeeklyTaskReport() {
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("assignment") ?? "";
  const week = searchParams.get("week") ?? undefined;
  const { data, isLoading } = useGetMyWeekQuery(
    { assignmentId, week },
    { skip: !assignmentId },
  );

  return (
    <WeeklyTaskReportView
      report={data}
      isLoading={isLoading}
      backHref="/student/weekly-tasks"
      backLabel="Back to weekly tasks"
    />
  );
}
