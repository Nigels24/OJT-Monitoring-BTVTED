"use client";

import { useParams, useSearchParams } from "next/navigation";
import PrintPage from "@/components/ui/PrintPage";
import {
  useGetAssessmentReportQuery,
  useGetAttendanceSummaryReportQuery,
  useGetDtrReportQuery,
  useGetJournalReportQuery,
  useGetProgressReportQuery,
  useGetSummaryReportQuery,
} from "@/lib/api/reportApi";
import { useGetCoursesQuery } from "@/lib/api/courseApi";
import { useGetEstablishmentsQuery } from "@/lib/api/establishmentApi";
import AssessmentSheet from "./AssessmentSheet";
import AttendanceSummarySheet from "./AttendanceSummarySheet";
import DtrSheet from "./DtrSheet";
import JournalSheet from "./JournalSheet";
import ProgressSheet from "./ProgressSheet";
import SummarySheet from "./SummarySheet";
import { SUMMARY_FILTER_KEYS, TRAINING_STATUS_LABEL } from "../filters";

export type ReportRole = "coordinator" | "student" | "supervisor";

const BACK: Record<ReportRole, { href: string; label: string }> = {
  coordinator: { href: "/coordinator/students", label: "Back to students" },
  student: { href: "/student/attendance", label: "Back to attendance" },
  supervisor: { href: "/supervisor/dashboard", label: "Back to dashboard" },
};

/** Each role's own print view of one evaluation sheet (Step 8). */
const EVALUATION_HREF: Record<ReportRole, (id: string) => string> = {
  coordinator: (id) => `/coordinator/evaluations/${id}/print`,
  student: (id) => `/student/evaluations/${id}/print`,
  supervisor: (id) => `/supervisor/evaluation/${id}/print`,
};

interface FrameProps {
  role: ReportRole;
  backHref?: string;
  isLoading: boolean;
  ready: boolean;
  children: React.ReactNode;
}

function Frame({ role, backHref, isLoading, ready, children }: FrameProps) {
  return (
    <PrintPage
      backHref={backHref ?? BACK[role].href}
      backLabel={BACK[role].label}
      canPrint={ready}
      framed={!isLoading && ready}
    >
      {isLoading ? (
        <p className="text-sm text-gray-500 py-12 text-center">
          Loading the report...
        </p>
      ) : !ready ? (
        <div className="bg-white rounded-lg p-8 text-center">
          <p className="text-sm text-gray-700">
            This report is not available. The placement may not exist, or it is
            not one you have access to.
          </p>
        </div>
      ) : (
        children
      )}
    </PrintPage>
  );
}

interface KindProps {
  role: ReportRole;
  /** Optional for a student, who defaults to their own current placement. */
  assignmentId: string | undefined;
  skip: boolean;
}

function Dtr({ role, assignmentId, skip }: KindProps) {
  const month = useSearchParams().get("month") ?? "";
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const { data, isLoading } = useGetDtrReportQuery(
    { assignmentId, month },
    { skip: skip || !valid },
  );
  return (
    <Frame role={role} isLoading={isLoading} ready={!!data}>
      {data && <DtrSheet report={data} />}
    </Frame>
  );
}

function Attendance({ role, assignmentId, skip }: KindProps) {
  const searchParams = useSearchParams();
  const { data, isLoading } = useGetAttendanceSummaryReportQuery(
    {
      assignmentId,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    },
    { skip },
  );
  return (
    <Frame role={role} isLoading={isLoading} ready={!!data}>
      {data && <AttendanceSummarySheet report={data} />}
    </Frame>
  );
}

function Progress({ role, assignmentId, skip }: KindProps) {
  const { data, isLoading } = useGetProgressReportQuery(
    { assignmentId },
    { skip },
  );
  return (
    <Frame role={role} isLoading={isLoading} ready={!!data}>
      {data && <ProgressSheet report={data} />}
    </Frame>
  );
}

function Journal({ role, assignmentId, skip }: KindProps) {
  const { data, isLoading } = useGetJournalReportQuery(
    { assignmentId },
    { skip },
  );
  return (
    <Frame role={role} isLoading={isLoading} ready={!!data}>
      {data && <JournalSheet report={data} />}
    </Frame>
  );
}

function Assessment({ role, assignmentId, skip }: KindProps) {
  const { data, isLoading } = useGetAssessmentReportQuery(
    { assignmentId },
    { skip },
  );
  return (
    <Frame role={role} isLoading={isLoading} ready={!!data}>
      {data && (
        <AssessmentSheet report={data} evaluationHref={EVALUATION_HREF[role]} />
      )}
    </Frame>
  );
}

/** Coordinator only — the server refuses anyone else. */
function Summary({ role }: { role: ReportRole }) {
  const searchParams = useSearchParams();
  // Only the Students list's own filter keys are forwarded: the server
  // rejects an unknown query parameter outright.
  const params: Record<string, string> = {};
  for (const key of SUMMARY_FILTER_KEYS) {
    const value = searchParams.get(key);
    if (value) params[key] = value;
  }
  const skip = role !== "coordinator";
  const { data, isLoading } = useGetSummaryReportQuery(params, { skip });
  const { data: courses } = useGetCoursesQuery(undefined, { skip });
  const { data: establishments } = useGetEstablishmentsQuery(undefined, {
    skip,
  });

  const course = courses?.find((c) => c.id === params.courseId);
  const block = course?.blocks?.find((b) => b.id === params.blockId);
  const establishment = establishments?.find(
    (e) => e.id === params.establishmentId,
  );
  const filterLabel = [
    params.scope === "all" ? "All Program" : "My Block",
    course?.code,
    params.yearLevel && `Year ${params.yearLevel}`,
    block?.name,
    params.academicYear && `A.Y. ${params.academicYear}`,
    (params.academicYearFrom || params.academicYearTo) &&
      `A.Y. ${params.academicYearFrom || "…"} to ${params.academicYearTo || "…"}`,
    establishment?.name,
    params.trainingStatus &&
      `Training: ${TRAINING_STATUS_LABEL[params.trainingStatus] ?? params.trainingStatus}`,
    params.status && `Account: ${params.status.toLowerCase()}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const qs = searchParams.toString();
  return (
    <Frame
      role={role}
      backHref={qs ? `${BACK[role].href}?${qs}` : undefined}
      isLoading={isLoading}
      ready={!!data}
    >
      {data && <SummarySheet report={data} filterLabel={filterLabel} />}
    </Frame>
  );
}

/**
 * One printable report, chosen by the route: `/<role>/reports/<kind>` with
 * `?assignment=<id>` (plus `month`, or `from`/`to`). Shared by all three
 * roles — the role prefix is only what `proxy.ts` routes on; what a caller
 * may read is decided by the server on every request.
 */
export default function ReportRoute({ role }: { role: ReportRole }) {
  const { kind } = useParams<{ kind: string }>();
  const assignmentId = useSearchParams().get("assignment") ?? undefined;
  // A supervisor or coordinator must name the placement.
  const skip = role !== "student" && !assignmentId;
  const props = { role, assignmentId, skip };

  switch (kind) {
    case "dtr":
      return <Dtr {...props} />;
    case "attendance":
      return <Attendance {...props} />;
    case "progress":
      return <Progress {...props} />;
    case "journal":
      return <Journal {...props} />;
    case "assessment":
      return <Assessment {...props} />;
    case "summary":
      return <Summary role={role} />;
    default:
      return (
        <Frame role={role} isLoading={false} ready={false}>
          {null}
        </Frame>
      );
  }
}
