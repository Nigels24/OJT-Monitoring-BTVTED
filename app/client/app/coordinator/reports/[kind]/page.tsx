"use client";

import { Suspense } from "react";
import ReportRoute from "@/features/reports/components/ReportRoute";

/**
 * Coordinator: one printable report — `/coordinator/reports/<kind>?assignment=<id>`.
 * The sheet and its access rules are shared; see `ReportRoute`.
 */
export default function CoordinatorReportPage() {
  return (
    <Suspense fallback={null}>
      <ReportRoute role="coordinator" />
    </Suspense>
  );
}
