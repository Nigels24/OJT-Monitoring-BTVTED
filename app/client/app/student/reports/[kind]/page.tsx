"use client";

import { Suspense } from "react";
import ReportRoute from "@/features/reports/components/ReportRoute";

/**
 * Student: one printable report — `/student/reports/<kind>?assignment=<id>`.
 * The sheet and its access rules are shared; see `ReportRoute`.
 */
export default function StudentReportPage() {
  return (
    <Suspense fallback={null}>
      <ReportRoute role="student" />
    </Suspense>
  );
}
