import type { ReportHeader as ReportHeaderData } from "@/lib/api/reportApi";
import { SCHOOL_NAME } from "@/lib/school";

/** A date-only value, long form, read in UTC like `formatDateOnly`. */
export function printDateOnly(iso: string | null | undefined): string {
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

/** A real instant (`generatedAt`, `gradedAt`), in the viewer's own time. */
export function printInstant(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Hours as printed: at most two decimals, no trailing zeros. */
export function printHours(hours: number): string {
  return String(Math.round(hours * 100) / 100);
}

/**
 * The top of every report: the school, the report's title and the day it was
 * generated. Borders only, no fills — browsers drop background colours when
 * printing.
 */
export function ReportTitle({
  title,
  generatedAt,
}: {
  title: string;
  generatedAt: string;
}) {
  return (
    <header className="text-center border-b-2 border-black pb-2 mb-4">
      <p className="text-[13pt] font-bold">{SCHOOL_NAME}</p>
      <h1 className="text-[11pt] font-bold uppercase tracking-wide">{title}</h1>
      <p className="text-[8pt]">Generated on {printInstant(generatedAt)}</p>
    </header>
  );
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-end gap-2">
      <span className="shrink-0 text-[10pt]">{label}:</span>
      <span className="flex-1 min-h-[1.4em] border-b border-black px-1 text-[10pt] font-semibold">
        {value}
      </span>
    </div>
  );
}

/** The trainee and placement blanks shared by the placement reports. */
export function PlacementFields({ report }: { report: ReportHeaderData }) {
  const { student, placement } = report;
  return (
    <section className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
      <Field label="Name of the Trainee" value={student.name} />
      <Field label="Student ID" value={student.studentIdNumber} />
      <Field label="Program" value={student.program ?? ""} />
      <Field
        label="Year Level / Block"
        value={[`Year ${placement.yearLevel}`, placement.block?.name]
          .filter(Boolean)
          .join(" · ")}
      />
      <Field label="Establishment" value={placement.establishment.name} />
      <Field label="Academic Year" value={placement.academicYear} />
      <Field
        label="Training Period"
        value={`${printDateOnly(placement.startDate)} – ${
          placement.endDate ? printDateOnly(placement.endDate) : "present"
        }`}
      />
      <Field label="Duty Days" value={placement.dutyDaysLabel} />
    </section>
  );
}

/** A signature line over a printed name. */
export function Signature({
  name,
  caption,
}: {
  name: string | null;
  caption: string;
}) {
  return (
    <div className="text-center">
      <div className="border-b border-black h-8" />
      <p className="mt-1 min-h-[1.4em] text-[10pt] font-semibold">{name}</p>
      <p className="text-[9pt]">{caption}</p>
    </div>
  );
}

export const cell = "border border-black px-2 py-1";
