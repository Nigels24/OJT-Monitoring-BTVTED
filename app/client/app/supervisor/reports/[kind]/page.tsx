"use client";

import { Suspense } from "react";
import ReportRoute from "@/features/reports/components/ReportRoute";

/**
 * Supervisor: one printable report — `/supervisor/reports/<kind>?assignment=<id>`.
 * The sheet and its access rules are shared; see `ReportRoute`.
 */
export default function SupervisorReportPage() {
  return (
    <Suspense fallback={null}>
      <ReportRoute role="supervisor" />
    </Suspense>
  );
}
