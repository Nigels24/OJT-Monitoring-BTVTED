import { Evaluation } from "@/lib/api/evaluationApi";
import { SCHOOL_NAME } from "@/lib/school";

interface EvaluationPrintSheetProps {
  evaluation: Evaluation;
}

/**
 * A date-only column, long form. Stored as UTC midnight of the intended day,
 * so it is read back in UTC — the same rule as `formatDateOnly` (`lib/format.ts`).
 */
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

/** One labelled blank of the form's header, filled in. */
function Blank({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-end gap-2">
      <span className="shrink-0 text-[10pt]">{label}:</span>
      <span className="flex-1 min-h-[1.4em] border-b border-black px-1 text-[10pt] font-semibold">
        {value}
      </span>
    </div>
  );
}

/** Free text printed over ruled lines, like the box on the paper form. */
function Prose({ heading, body }: { heading: string; body: string | null }) {
  const text = body?.trim();
  return (
    <div className="break-inside-avoid">
      <p className="text-[10pt] font-bold uppercase">{heading}:</p>
      {text ? (
        <p className="mt-1 border-b border-black pb-1 text-[10pt] whitespace-pre-wrap">
          {text}
        </p>
      ) : (
        // Nothing was written: leave the form's blank lines rather than
        // dropping the heading, so the printed sheet still reads as the form.
        <div aria-hidden="true">
          <div className="h-6 border-b border-black" />
          <div className="h-6 border-b border-black" />
        </div>
      )}
    </div>
  );
}

/**
 * The supervisor's filled-in sheet, laid out in the order of the paper form:
 * letterhead and title, the header blanks, the 1-5 legend, each section with
 * its lettered items and scores, TOTAL RATING, comments, recommendations, the
 * evaluator's name and position, then signature lines for the evaluator and
 * the trainee.
 *
 * Everything printed comes from the evaluation's own `sections`, `scale` and
 * snapshots, so a sheet signed on an earlier template version prints that
 * version's wording and maximum. Nothing here restates the form.
 *
 * Borders only, no fills: browsers drop background colours when printing
 * unless the user opts in, and a sheet that depends on them prints blank bars.
 */
export default function EvaluationPrintSheet({
  evaluation,
}: EvaluationPrintSheetProps) {
  const traineeName = evaluation.student.user.name;
  // The snapshots first: they are what the sheet was signed with.
  const evaluatorName =
    evaluation.evaluatorName ?? evaluation.supervisor.user.name;
  const evaluatorPosition =
    evaluation.evaluatorPosition ?? evaluation.supervisor.position ?? "";
  const employedAt =
    evaluation.trainingEmployedAt ??
    evaluation.student.establishment?.name ??
    "";

  return (
    <article className="text-black font-sans leading-snug">
      <header className="text-center border-b-2 border-black pb-2 mb-4">
        <p className="text-[13pt] font-bold">{SCHOOL_NAME}</p>
        <h1 className="text-[11pt] font-bold uppercase tracking-wide">
          {evaluation.templateTitle}
        </h1>
      </header>

      <section className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
        <Blank label="Name of the Trainee" value={traineeName} />
        <Blank label="Student ID" value={evaluation.student.studentIdNumber} />
        <Blank label="Course" value={evaluation.student.course ?? ""} />
        <Blank label="Training Employed at" value={employedAt} />
        <Blank
          label="Training Date Started"
          value={printDateOnly(evaluation.trainingStartedAt)}
        />
        <Blank
          label="Training Date Ended"
          value={printDateOnly(evaluation.trainingEndedAt)}
        />
      </section>

      <p className="border border-black px-2 py-1.5 mb-4 text-center text-[9pt] font-semibold">
        {evaluation.scale.map((entry, index) => (
          <span key={entry.value}>
            {index > 0 && <span className="mx-2">·</span>}
            {entry.value} – {entry.label}
          </span>
        ))}
      </p>

      <table className="w-full border-collapse border border-black text-[10pt] mb-4">
        {evaluation.sections.map((section) => (
          <tbody key={section.key} className="break-inside-avoid">
            <tr>
              <th
                scope="colgroup"
                colSpan={2}
                className="border border-black px-2 py-1 text-left font-bold uppercase"
              >
                {section.numeral}. {section.label} ({section.maxPoints} points)
              </th>
              <th
                scope="col"
                className="border border-black px-2 py-1 text-center font-bold whitespace-nowrap tabular-nums"
              >
                {section.total} / {section.maxPoints}
              </th>
            </tr>
            {section.items.map((item) => (
              <tr key={item.key}>
                <td className="border border-black px-2 py-1 w-8 text-center align-top font-semibold">
                  {item.letter}.
                </td>
                <td className="border border-black px-2 py-1 align-top">
                  {item.label}
                </td>
                <td className="border border-black px-2 py-1 w-20 text-center align-top font-bold tabular-nums">
                  {item.score}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
        {/* A last body row, not a <tfoot>: a table footer is repeated at the foot
            of every printed page the table spans. */}
        <tbody>
          <tr>
            <th
              scope="row"
              colSpan={2}
              className="border-2 border-black px-2 py-1.5 text-right font-bold"
            >
              TOTAL RATING
            </th>
            <td className="border-2 border-black px-2 py-1.5 text-center font-bold whitespace-nowrap tabular-nums">
              {evaluation.totalRating} / {evaluation.maxTotalRating}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="space-y-3 mb-4">
        <Prose heading="Comments" body={evaluation.comments} />
        <Prose heading="Recommendations" body={evaluation.recommendations} />
      </div>

      <section className="break-inside-avoid">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-10">
          <Blank label="Evaluated by" value={evaluatorName} />
          <Blank label="Position" value={evaluatorPosition} />
        </div>

        <div className="grid grid-cols-2 gap-x-10">
          <div className="text-center">
            <div className="border-b border-black h-8" />
            <p className="mt-1 text-[10pt] font-semibold">{evaluatorName}</p>
            <p className="text-[9pt]">
              Signature over printed name of the Evaluator
            </p>
            <p className="mt-3 text-left text-[9pt]">
              Date: ______________________
            </p>
          </div>
          <div className="text-center">
            <div className="border-b border-black h-8" />
            <p className="mt-1 text-[10pt] font-semibold">{traineeName}</p>
            <p className="text-[9pt]">
              Signature over printed name of the Trainee
            </p>
            <p className="mt-3 text-left text-[9pt]">
              Date: ______________________
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-6 text-center text-[8pt] text-gray-600">
        Evaluation sheet version {evaluation.templateVersion} · Evaluated on{" "}
        {new Date(evaluation.createdAt).toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </footer>
    </article>
  );
}
