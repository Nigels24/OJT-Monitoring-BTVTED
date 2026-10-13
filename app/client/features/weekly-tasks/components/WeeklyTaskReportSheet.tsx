import type { WeeklyTaskWeek } from "@/lib/api/weeklyTaskApi";
import { MAX_TASK_RATING } from "@/lib/api/weeklyTaskApi";
import { SCHOOL_NAME } from "@/lib/school";

interface WeeklyTaskReportSheetProps {
  report: WeeklyTaskWeek & {
    assignment: NonNullable<WeeklyTaskWeek["assignment"]>;
    student: NonNullable<WeeklyTaskWeek["student"]>;
  };
}

/** A date-only value, long form, read in UTC like `formatDateOnly`. */
function printDateOnly(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A real instant (`doneAt`), shown as the viewer's own calendar day. */
function printInstant(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_LABEL = { ASSIGNED: "Assigned", DONE: "Done", RATED: "Rated" };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-end gap-2">
      <span className="shrink-0 text-[10pt]">{label}:</span>
      <span className="flex-1 min-h-[1.4em] border-b border-black px-1 text-[10pt] font-semibold">
        {value}
      </span>
    </div>
  );
}

/**
 * The Weekly Task Report — the means of verification (MOV) for the student's
 * daily journal: what the supervisor assigned for one week, what was done,
 * the proof, and how it was rated.
 *
 * Everything printed comes from the one `WeeklyTaskWeek` the page already
 * shows, so the printout cannot disagree with the screen. Borders only, no
 * fills, for the reason the evaluation sheet gives: browsers drop background
 * colours when printing.
 *
 * The week average is the mean of the rated tasks only, printed as a number.
 * It is not the official evaluation's TOTAL RATING and is never added to it.
 */
export default function WeeklyTaskReportSheet({
  report,
}: WeeklyTaskReportSheetProps) {
  const { assignment, student, week, tasks, summary } = report;
  const tasksWithPhotos = tasks.filter((task) => task.photos.length > 0);
  const program = [student.programCode, student.program]
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(" — ");

  return (
    <article className="text-black font-sans leading-snug">
      <header className="text-center border-b-2 border-black pb-2 mb-4">
        <p className="text-[13pt] font-bold">{SCHOOL_NAME}</p>
        <h1 className="text-[11pt] font-bold uppercase tracking-wide">
          Weekly Task Report
        </h1>
      </header>

      <section className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
        <Field label="Name of the Trainee" value={student.name} />
        <Field label="Student No." value={student.studentIdNumber} />
        <Field label="Program" value={program} />
        <Field
          label="Year Level / Block"
          value={[`Year ${assignment.yearLevel}`, assignment.block?.name]
            .filter(Boolean)
            .join(" / ")}
        />
        <Field label="Establishment" value={assignment.establishment.name} />
        <Field
          label="Week Covered"
          value={`${printDateOnly(week.start)} – ${printDateOnly(week.end)}`}
        />
      </section>

      <table className="w-full border-collapse border border-black text-[9.5pt] mb-3">
        <thead>
          <tr>
            {[
              "Task",
              "Due Date",
              "Status",
              "Date Done",
              "Rating",
              "Supervisor's Comment",
            ].map((heading) => (
              <th
                key={heading}
                scope="col"
                className="border border-black px-2 py-1 text-left font-bold"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                className="border border-black px-2 py-3 text-center"
              >
                No tasks were assigned for this week.
              </td>
            </tr>
          ) : (
            tasks.map((task, index) => (
              <tr key={task.id} className="break-inside-avoid">
                <td className="border border-black px-2 py-1 align-top">
                  <span className="font-semibold">
                    {index + 1}. {task.title}
                  </span>
                  {task.description && (
                    <span className="block whitespace-pre-wrap">
                      {task.description}
                    </span>
                  )}
                </td>
                <td className="border border-black px-2 py-1 align-top whitespace-nowrap">
                  {new Date(task.dueDate).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </td>
                <td className="border border-black px-2 py-1 align-top">
                  {STATUS_LABEL[task.status]}
                </td>
                <td className="border border-black px-2 py-1 align-top whitespace-nowrap">
                  {printInstant(task.doneAt)}
                </td>
                <td className="border border-black px-2 py-1 align-top text-center font-bold whitespace-nowrap tabular-nums">
                  {task.rating === null
                    ? "—"
                    : `${task.rating} / ${MAX_TASK_RATING}`}
                </td>
                <td className="border border-black px-2 py-1 align-top whitespace-pre-wrap">
                  {task.ratingComment ?? ""}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <p className="border-2 border-black px-2 py-1.5 mb-4 flex items-center justify-between text-[10pt] font-bold break-inside-avoid">
        <span>
          WEEK AVERAGE RATING
          <span className="font-normal">
            {" "}
            ({summary.rated} of {summary.total} task
            {summary.total === 1 ? "" : "s"} rated)
          </span>
        </span>
        <span className="tabular-nums">
          {summary.averageRating === null
            ? "—"
            : `${summary.averageRating.toFixed(2)} / ${MAX_TASK_RATING}`}
        </span>
      </p>

      <section className="mb-6">
        <h2 className="text-[10pt] font-bold uppercase mb-2">Proof Photos</h2>
        {tasksWithPhotos.length === 0 ? (
          <p className="text-[10pt]">No proof photos were attached this week.</p>
        ) : (
          <div className="space-y-3">
            {tasksWithPhotos.map((task) => (
              <div key={task.id} className="break-inside-avoid">
                <p className="text-[9.5pt] font-semibold mb-1">
                  {tasks.indexOf(task) + 1}. {task.title}
                </p>
                <ul className="grid grid-cols-5 gap-2">
                  {task.photos.map((photo) => (
                    <li key={photo.id} className="border border-black">
                      {photo.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo.url}
                          alt={photo.originalName}
                          className="w-full h-[28mm] object-cover"
                        />
                      ) : (
                        <div className="w-full h-[28mm] flex items-center justify-center text-[8pt] text-center px-1">
                          Photo unavailable
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-x-10 break-inside-avoid pt-8">
        <div className="text-center">
          <p className="min-h-[1.4em] text-[10pt] font-semibold">
            {student.name}
          </p>
          <div className="border-b border-black" />
          <p className="mt-1 text-[9pt]">Student</p>
          <p className="mt-3 text-left text-[9pt]">
            Date: ______________________
          </p>
        </div>
        <div className="text-center">
          <p className="min-h-[1.4em] text-[10pt] font-semibold">
            {report.supervisorName ?? ""}
          </p>
          <div className="border-b border-black" />
          <p className="mt-1 text-[9pt]">Company Supervisor</p>
          <p className="mt-3 text-left text-[9pt]">
            Date: ______________________
          </p>
        </div>
      </section>
    </article>
  );
}
