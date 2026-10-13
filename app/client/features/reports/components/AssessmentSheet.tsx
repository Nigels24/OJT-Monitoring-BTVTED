import Link from "next/link";
import type { AssessmentReport } from "@/lib/api/reportApi";
import { formatGrade } from "@/lib/format";
import {
  PlacementFields,
  ReportTitle,
  Signature,
  cell,
  printInstant,
} from "./ReportParts";

interface AssessmentSheetProps {
  report: AssessmentReport;
  /** This role's print view of one evaluation sheet. */
  evaluationHref: (id: string) => string;
}

/**
 * The two parts of the assessment on one page: the supervisor's evaluation
 * and the coordinator's grade. They are shown side by side and never combined
 * into one figure.
 */
export default function AssessmentSheet({
  report,
  evaluationHref,
}: AssessmentSheetProps) {
  const { coordinatorGrade: grade } = report;
  return (
    <article className="text-black font-sans leading-snug">
      <ReportTitle
        title="Trainee Assessment Record"
        generatedAt={report.generatedAt}
      />
      <PlacementFields report={report} />

      <section className="mb-4 break-inside-avoid">
        <p className="text-[10pt] font-bold uppercase mb-1">
          Part I — Supervisor&apos;s Evaluation
        </p>
        <table className="w-full border-collapse border border-black text-[10pt]">
          <thead>
            <tr>
              <th className={`${cell} text-left font-bold`}>Evaluated by</th>
              <th className={`${cell} text-left font-bold`}>Date</th>
              <th className={`${cell} text-center font-bold`}>Total Rating</th>
              <th className={`${cell} print:hidden`}>
                <span className="sr-only">Evaluation sheet</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {report.evaluations.length === 0 && (
              <tr>
                <td colSpan={4} className={`${cell} text-center`}>
                  No evaluation has been submitted for this placement yet.
                </td>
              </tr>
            )}
            {report.evaluations.map((evaluation) => (
              <tr key={evaluation.id}>
                <td className={cell}>
                  {evaluation.evaluatorName ?? "—"}
                  {evaluation.evaluatorPosition && (
                    <span className="block text-[9pt]">
                      {evaluation.evaluatorPosition}
                    </span>
                  )}
                </td>
                <td className={`${cell} whitespace-nowrap`}>
                  {printInstant(evaluation.createdAt)}
                </td>
                <td className={`${cell} text-center font-bold tabular-nums`}>
                  {evaluation.totalRating} / {evaluation.maxTotalRating}
                </td>
                <td className={`${cell} text-center print:hidden`}>
                  <Link
                    href={evaluationHref(evaluation.id)}
                    className="text-blue-700 underline"
                  >
                    Open sheet
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-10 break-inside-avoid">
        <p className="text-[10pt] font-bold uppercase mb-1">
          Part II — Coordinator&apos;s Grade
        </p>
        <table className="w-full border-collapse border border-black text-[10pt]">
          <tbody>
            <tr>
              <th className={`${cell} text-left font-semibold w-48`}>Grade</th>
              <td className={`${cell} font-bold tabular-nums`}>
                {grade.grade === null ? "Not yet graded" : formatGrade(grade.grade)}
              </td>
            </tr>
            <tr>
              <th className={`${cell} text-left font-semibold`}>Graded by</th>
              <td className={cell}>{grade.gradedByName ?? ""}</td>
            </tr>
            <tr>
              <th className={`${cell} text-left font-semibold`}>Date graded</th>
              <td className={cell}>{printInstant(grade.gradedAt)}</td>
            </tr>
            <tr>
              <th className={`${cell} text-left font-semibold align-top`}>
                Remarks
              </th>
              <td className={`${cell} whitespace-pre-wrap min-h-[3em]`}>
                {grade.remarks ?? ""}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="break-inside-avoid grid grid-cols-2 gap-x-10">
        <Signature
          name={report.student.name}
          caption="Signature over printed name of the Trainee"
        />
        <Signature name={grade.gradedByName} caption="OJT Coordinator" />
      </section>
    </article>
  );
}
