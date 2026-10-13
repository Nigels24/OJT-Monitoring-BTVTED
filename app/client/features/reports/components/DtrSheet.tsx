import type { DtrReport } from "@/lib/api/reportApi";
import { printHours } from "./ReportParts";

const th = "border border-black px-1 py-0.5 font-bold text-center";
const td = "border border-black px-1 text-center tabular-nums h-[4.4mm]";

/**
 * The daily time record, laid out as Civil Service Form No. 48.
 *
 * **One copy on one portrait A4 page.** The paper form is often printed two
 * to a landscape sheet; here every other sheet is A4 portrait (the shared
 * `@page` rule in `globals.css`), and two copies side by side at that size
 * leave the clock times too small to read. The form is kept at its own narrow
 * width so it still reads as the form — print twice for a second copy.
 *
 * Only approved entries appear: the server sends nothing else. Undertime is
 * part of the form and is left blank; the system does not compute it.
 * 31 rows are always printed, as on the paper form; days the month does not
 * have are struck through.
 */
export default function DtrSheet({ report }: { report: DtrReport }) {
  const byDay = new Map(report.days.map((day) => [day.day, day]));
  // The form's two blanks are for office hours, which a placement does not
  // record — it records duty days. The weekdays go on the first line.
  const regularDays =
    report.placement.dutyDaysLabel
      .split(", ")
      .filter((label) => label !== "Sat" && label !== "Sun")
      .join(", ") || "—";
  const saturdays = report.placement.dutyDays.includes("SAT")
    ? "Duty day"
    : "None";

  return (
    <article className="mx-auto max-w-[125mm] text-black font-serif text-[9pt] leading-tight">
      <p className="text-[8pt] italic">Civil Service Form No. 48</p>
      <h1 className="mt-1 text-center text-[13pt] font-bold tracking-wide">
        DAILY TIME RECORD
      </h1>
      <p className="text-center">-----o0o-----</p>

      <p className="mt-2 border-b border-black text-center text-[11pt] font-bold uppercase min-h-[1.4em]">
        {report.student.nameLastFirst}
      </p>
      <p className="text-center text-[8pt]">(Name)</p>

      <div className="mt-2 flex items-end gap-2">
        <span className="shrink-0 italic">For the month of</span>
        <span className="flex-1 border-b border-black px-1 text-center font-semibold">
          {report.label}
        </span>
      </div>
      <div className="mt-1 flex gap-3">
        <span className="shrink-0 italic leading-snug">
          Official hours for arrival
          <br />
          and departure
        </span>
        <div className="flex-1 space-y-0.5">
          <div className="flex items-end gap-2">
            <span className="shrink-0 italic">Regular days</span>
            <span className="flex-1 border-b border-black px-1 text-center font-semibold">
              {regularDays}
            </span>
          </div>
          <div className="flex items-end gap-2">
            <span className="shrink-0 italic">Saturdays</span>
            <span className="flex-1 border-b border-black px-1 text-center font-semibold">
              {saturdays}
            </span>
          </div>
        </div>
      </div>

      <table className="mt-2 w-full border-collapse border-2 border-black">
        <thead>
          <tr>
            <th rowSpan={2} className={`${th} w-[9mm]`}>
              Day
            </th>
            <th colSpan={2} className={th}>
              A.M.
            </th>
            <th colSpan={2} className={th}>
              P.M.
            </th>
            <th colSpan={2} className={th}>
              Undertime
            </th>
          </tr>
          <tr>
            <th className={th}>Arrival</th>
            <th className={th}>Departure</th>
            <th className={th}>Arrival</th>
            <th className={th}>Departure</th>
            <th className={th}>Hours</th>
            <th className={th}>Minutes</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 31 }, (_, index) => {
            const day = byDay.get(index + 1);
            return (
              <tr key={index}>
                <td className={`${td} font-semibold`}>{index + 1}</td>
                {day ? (
                  <>
                    <td className={td}>{day.amArrival}</td>
                    <td className={td}>{day.amDeparture}</td>
                    <td className={td}>{day.pmArrival}</td>
                    <td className={td}>{day.pmDeparture}</td>
                    <td className={td} />
                    <td className={td} />
                  </>
                ) : (
                  // Not a day of this month.
                  <td colSpan={6} className={td}>
                    <span className="block border-t border-black" />
                  </td>
                )}
              </tr>
            );
          })}
          {/* A body row, not a <tfoot>, like every other sheet. */}
          <tr>
            <th className={`${th} border-t-2`}>TOTAL</th>
            <td colSpan={4} className={`${td} border-t-2 font-bold`}>
              {printHours(report.totalHours)} hours · {report.daysRendered}{" "}
              {report.daysRendered === 1 ? "day" : "days"}
            </td>
            <td className={`${td} border-t-2`} />
            <td className={`${td} border-t-2`} />
          </tr>
        </tbody>
      </table>

      <p className="mt-2 italic text-justify leading-snug">
        I certify on my honor that the above is a true and correct report of the
        hours of work performed, record of which was made daily at the time of
        arrival and departure from office.
      </p>

      <div className="mt-6 text-center">
        <div className="border-b border-black" />
        <p className="font-semibold">{report.student.name}</p>
      </div>

      <p className="mt-2 italic">VERIFIED as to the prescribed office hours:</p>

      <div className="mt-6 text-center">
        <div className="border-b border-black" />
        <p className="min-h-[1.3em] font-semibold">{report.supervisorName}</p>
        <p>In-Charge</p>
        <p className="text-[8pt]">{report.placement.establishment.name}</p>
      </div>

      <p className="mt-2 border-t border-black pt-1 text-center font-semibold">
        Total hours rendered this month: {printHours(report.totalHours)}
      </p>
    </article>
  );
}
