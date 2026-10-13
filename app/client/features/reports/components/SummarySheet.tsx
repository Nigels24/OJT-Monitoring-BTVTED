import type { SummaryReport } from "@/lib/api/reportApi";
import { ReportTitle, cell } from "./ReportParts";

interface SummarySheetProps {
  report: SummaryReport;
  /** The filters in words, e.g. "My Block · Year 4 · A.Y. 2026-2027". */
  filterLabel: string;
}

/** The coordinator's program/block summary for the current filters. */
export default function SummarySheet({
  report,
  filterLabel,
}: SummarySheetProps) {
  const { counts, unverifiedAttendance } = report;
  const countRows: [string, number][] = [
    ["Students in this selection", counts.totalStudents],
    ["Active trainees", counts.activeTrainees],
    ["Completed trainees", counts.completedTrainees],
    ["Ended / cancelled placements", counts.endedOrCancelled],
    ["No placement yet", counts.noPlacement],
  ];

  return (
    <article className="text-black font-sans leading-snug">
      <ReportTitle
        title="Program / Block Summary"
        generatedAt={report.generatedAt}
      />
      <p className="mb-3 text-[10pt]">
        <span className="font-semibold">Selection:</span> {filterLabel}
        {report.noBlocksAssigned &&
          " (no blocks assigned to you — showing the whole program)"}
      </p>

      <section className="mb-4 break-inside-avoid">
        <p className="text-[10pt] font-bold uppercase mb-1">Trainees</p>
        <table className="w-full border-collapse border border-black text-[10pt]">
          <tbody>
            {countRows.map(([label, value]) => (
              <tr key={label}>
                <th className={`${cell} text-left font-semibold`}>{label}</th>
                <td className={`${cell} text-right tabular-nums w-24`}>
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-4">
        <p className="text-[10pt] font-bold uppercase mb-1">
          Attendance awaiting verification, by establishment
        </p>
        <table className="w-full border-collapse border border-black text-[10pt]">
          <thead>
            <tr>
              <th className={`${cell} text-left font-bold`}>Establishment</th>
              <th className={`${cell} text-center font-bold w-24`}>Pending</th>
              <th className={`${cell} text-center font-bold w-24`}>Overdue</th>
            </tr>
          </thead>
          <tbody>
            {unverifiedAttendance.byEstablishment.length === 0 && (
              <tr>
                <td colSpan={3} className={`${cell} text-center`}>
                  No attendance is waiting for verification.
                </td>
              </tr>
            )}
            {unverifiedAttendance.byEstablishment.map((row) => (
              <tr key={row.id ?? "none"} className="break-inside-avoid">
                <td className={cell}>{row.name}</td>
                <td className={`${cell} text-center tabular-nums`}>
                  {row.pending}
                </td>
                <td className={`${cell} text-center tabular-nums`}>
                  {row.overdue}
                </td>
              </tr>
            ))}
            <tr>
              <th className="border-2 border-black px-2 py-1 text-right font-bold">
                TOTAL
              </th>
              <td className="border-2 border-black px-2 py-1 text-center font-bold tabular-nums">
                {unverifiedAttendance.pending}
              </td>
              <td className="border-2 border-black px-2 py-1 text-center font-bold tabular-nums">
                {unverifiedAttendance.overdue}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-[8pt]">
          Overdue: pending for 21 days or more since it was submitted.
        </p>
      </section>

      <section>
        <p className="text-[10pt] font-bold uppercase mb-1">
          Students missing required documents (
          {report.missingDocuments.length})
        </p>
        <table className="w-full border-collapse border border-black text-[10pt]">
          <thead>
            <tr>
              <th className={`${cell} text-left font-bold w-32`}>Student ID</th>
              <th className={`${cell} text-left font-bold`}>Name</th>
              <th className={`${cell} text-left font-bold`}>Missing</th>
            </tr>
          </thead>
          <tbody>
            {report.missingDocuments.length === 0 && (
              <tr>
                <td colSpan={3} className={`${cell} text-center`}>
                  Every student in this selection has all required documents on
                  file.
                </td>
              </tr>
            )}
            {report.missingDocuments.map((student) => (
              <tr key={student.id} className="break-inside-avoid">
                <td className={`${cell} tabular-nums`}>
                  {student.studentIdNumber}
                </td>
                <td className={cell}>{student.name}</td>
                <td className={cell}>
                  {student.missing.map((doc) => doc.name).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </article>
  );
}
