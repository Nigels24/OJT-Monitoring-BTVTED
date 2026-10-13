"use client";

import { useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";

interface ReportLinksProps {
  /** `/coordinator/reports`, `/student/reports` or `/supervisor/reports`. */
  basePath: string;
  /** Left out by a student, whose reports default to their own placement. */
  assignmentId?: string;
  className?: string;
}

/** This month as `yyyy-mm`, in the viewer's own calendar. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const OTHER_REPORTS = [
  { kind: "attendance", label: "Attendance summary" },
  { kind: "progress", label: "Progress report" },
  { kind: "journal", label: "Compiled journal" },
  { kind: "assessment", label: "Assessment record" },
];

/**
 * "Print DTR" with its month picker, and links to the placement's other
 * printable reports. Links only — each opens a print route that fetches for
 * itself, and the server decides there whether this placement may be read.
 */
export default function ReportLinks({
  basePath,
  assignmentId,
  className = "",
}: ReportLinksProps) {
  const [month, setMonth] = useState(currentMonth);
  const query = (extra: Record<string, string>) => {
    const params = new URLSearchParams(extra);
    if (assignmentId) params.set("assignment", assignmentId);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>
      <div className="flex items-center gap-1.5">
        <input
          type="month"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
          }}
          aria-label="Month of the daily time record"
          className="h-8 px-2 border border-gray-300 rounded-md text-xs text-gray-700 bg-white"
        />
        {month ? (
          <Link
            href={`${basePath}/dtr${query({ month })}`}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-medium whitespace-nowrap"
          >
            <Printer size={13} />
            Print DTR
          </Link>
        ) : (
          <span className="text-xs text-gray-400">Pick a month</span>
        )}
      </div>
      {OTHER_REPORTS.map((report) => (
        <Link
          key={report.kind}
          href={`${basePath}/${report.kind}${query({})}`}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          {report.label}
        </Link>
      ))}
    </div>
  );
}
