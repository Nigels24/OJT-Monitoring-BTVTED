import type { ProgressReport } from "@/lib/api/reportApi";
import { COMPLETION_ITEMS } from "./CompletionChecklist";
import {
  PlacementFields,
  ReportTitle,
  Signature,
  cell,
  printHours,
} from "./ReportParts";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  TRANSFERRED: "Transferred",
  CANCELLED: "Cancelled",
};

/** Hours required, rendered and remaining, and the completion checklist. */
export default function ProgressSheet({ report }: { report: ProgressReport }) {
  const { progress, completion, placement } = report;
  const rows: [string, string][] = [
    ["Required hours", printHours(progress.requiredHours)],
    ["Approved hours rendered", printHours(progress.approvedHours)],
    ["Hours awaiting approval", printHours(progress.pendingHours)],
    ["Hours remaining", printHours(progress.remainingHours)],
    ["Percent complete", `${progress.percentComplete}%`],
    [
      "Duty days with approved attendance",
      `${progress.daysWithApprovedAttendance} of ${progress.expectedDutyDaysToDate} expected to date`,
    ],
    ["Placement status", STATUS_LABEL[placement.status] ?? placement.status],
  ];

  return (
    <article className="text-black font-sans leading-snug">
      <ReportTitle
        title="Training Progress Report"
        generatedAt={report.generatedAt}
      />
      <PlacementFields report={report} />

      <table className="w-full border-collapse border border-black text-[10pt] mb-4">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th className={`${cell} text-left font-semibold`}>{label}</th>
              <td className={`${cell} text-right tabular-nums w-64`}>
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="break-inside-avoid mb-10">
        <p className="text-[10pt] font-bold uppercase mb-1">
          Completion requirements
        </p>
        <table className="w-full border-collapse border border-black text-[10pt]">
          <tbody>
            {COMPLETION_ITEMS.map((item) => (
              <tr key={item.key}>
                <td className={cell}>{item.label}</td>
                <td className={`${cell} text-center font-semibold w-32`}>
                  {completion[item.key] ? "Met" : "Not yet"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="break-inside-avoid grid grid-cols-2 gap-x-10">
        <Signature
          name={report.student.name}
          caption="Signature over printed name of the Trainee"
        />
        <Signature name={null} caption="OJT Coordinator" />
      </section>
    </article>
  );
}
