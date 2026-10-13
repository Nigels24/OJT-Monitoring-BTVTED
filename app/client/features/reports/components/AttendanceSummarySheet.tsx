import type {
  AttendanceSummaryReport,
  SummaryDayStatus,
} from "@/lib/api/reportApi";
import {
  PlacementFields,
  ReportTitle,
  cell,
  printDateOnly,
  printHours,
} from "./ReportParts";

const STATUS_LABEL: Record<SummaryDayStatus, string> = {
  APPROVED: "Approved",
  PENDING: "Pending",
  DECLINED: "Declined",
  MISSING_LOG: "Missing Log",
  NOT_DUTY_DAY: "Not a Duty Day",
};

const STATUS_ORDER = Object.keys(STATUS_LABEL) as SummaryDayStatus[];

const WEEKDAY: Record<string, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

/**
 * Every day of the range with what happened on it. "Missing Log" and "Not a
 * Duty Day" are decided by the server (`attendance-summary.ts`), not here.
 */
export default function AttendanceSummarySheet({
  report,
}: {
  report: AttendanceSummaryReport;
}) {
  return (
    <article className="text-black font-sans leading-snug">
      <ReportTitle
        title="Attendance Summary"
        generatedAt={report.generatedAt}
      />
      <PlacementFields report={report} />
      <p className="mb-2 text-[10pt]">
        <span className="font-semibold">Period covered:</span>{" "}
        {printDateOnly(report.range.from)} – {printDateOnly(report.range.to)}
      </p>

      <table className="w-full border-collapse border border-black text-[9pt] mb-4">
        <thead>
          <tr>
            {[
              "Date",
              "Day",
              "A.M. In",
              "A.M. Out",
              "P.M. In",
              "P.M. Out",
              "Hours",
              "Status",
            ].map((heading) => (
              <th key={heading} className={`${cell} text-center font-bold`}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.days.length === 0 && (
            <tr>
              <td colSpan={8} className={`${cell} text-center`}>
                Nothing to show for this period.
              </td>
            </tr>
          )}
          {report.days.map((day) => (
            <tr key={day.date} className="break-inside-avoid">
              <td className={`${cell} whitespace-nowrap`}>
                {printDateOnly(day.date)}
              </td>
              <td className={`${cell} text-center`}>
                {WEEKDAY[day.weekday] ?? day.weekday}
              </td>
              <td className={`${cell} text-center tabular-nums`}>
                {day.amArrival}
              </td>
              <td className={`${cell} text-center tabular-nums`}>
                {day.amDeparture}
              </td>
              <td className={`${cell} text-center tabular-nums`}>
                {day.pmArrival}
              </td>
              <td className={`${cell} text-center tabular-nums`}>
                {day.pmDeparture}
              </td>
              <td className={`${cell} text-center tabular-nums`}>
                {day.hours === null ? "" : printHours(day.hours)}
              </td>
              <td className={`${cell} text-center font-semibold`}>
                {STATUS_LABEL[day.status] ?? day.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="break-inside-avoid">
        <table className="border-collapse border border-black text-[10pt]">
          <tbody>
            {STATUS_ORDER.map((status) => (
              <tr key={status}>
                <th className={`${cell} text-left font-semibold`}>
                  {STATUS_LABEL[status]}
                </th>
                <td className={`${cell} text-right tabular-nums w-24`}>
                  {report.totals[status]}{" "}
                  {report.totals[status] === 1 ? "day" : "days"}
                </td>
              </tr>
            ))}
            <tr>
              <th className={`${cell} text-left font-semibold`}>
                Hours awaiting approval
              </th>
              <td className={`${cell} text-right tabular-nums`}>
                {printHours(report.pendingHours)}
              </td>
            </tr>
            <tr>
              <th className="border-2 border-black px-2 py-1 text-left font-bold">
                APPROVED HOURS
              </th>
              <td className="border-2 border-black px-2 py-1 text-right font-bold tabular-nums">
                {printHours(report.approvedHours)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </article>
  );
}
