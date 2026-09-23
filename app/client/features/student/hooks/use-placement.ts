import { useState } from "react";
import {
  useGetPlacementDefaultsQuery,
  useCreatePlacementMutation,
  useGetAssignmentsQuery,
  Student,
  Weekday,
} from "@/lib/api/studentApi";
import { useGetEstablishmentsQuery } from "@/lib/api/establishmentApi";
import { useGetBlocksQuery } from "@/lib/api/courseApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";

/** The BTVTED pattern the thesis describes as the common duty-day spread. */
const DEFAULT_DUTY_DAYS: Weekday[] = ["WED", "THU", "FRI"];
const DEFAULT_ACADEMIC_YEAR = "2025-2026";

export const DUTY_DAY_OPTIONS: Weekday[] = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
];

/**
 * One placement action: pick an establishment, confirm the auto-filled
 * hours, set duty days and a start date. If the student already has an
 * ACTIVE assignment, the server transfers it out (never deletes it) and
 * starts the new one at zero — `activeAssignment` is surfaced so the dialog
 * can warn about that before it happens.
 */
export function usePlacement(student: Student | null, onPlaced: () => void) {
  const [prevStudentId, setPrevStudentId] = useState<string | null>(null);
  const [establishmentId, setEstablishmentId] = useState("");
  const [prevEstablishmentId, setPrevEstablishmentId] = useState("");
  const [requiredHoursOverride, setRequiredHoursOverride] = useState<
    string | null
  >(null);
  const [dutyDays, setDutyDays] = useState<Weekday[]>(DEFAULT_DUTY_DAYS);
  const [startDate, setStartDate] = useState("");
  const [academicYear, setAcademicYear] = useState(DEFAULT_ACADEMIC_YEAR);
  const [blockId, setBlockId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  // Resets the whole form whenever the dialog's target student changes
  // (opening on a different student, or closing — `student` becomes null).
  // A synchronous render-body adjustment, not an effect: see Overlay.tsx's
  // `wasOpen` comment for why a value compared during render is the pattern
  // here, not `useEffect` + `setState`.
  const studentId = student?.id ?? null;
  if (studentId !== prevStudentId) {
    setPrevStudentId(studentId);
    setEstablishmentId("");
    setPrevEstablishmentId("");
    setRequiredHoursOverride(null);
    setDutyDays(DEFAULT_DUTY_DAYS);
    setStartDate("");
    setAcademicYear(DEFAULT_ACADEMIC_YEAR);
    setBlockId("");
    setConfirmed(false);
    setError("");
  }
  // A different establishment invalidates any hours typed for the previous
  // one — re-default from the new establishment's own requirement rather
  // than silently keeping a stale override.
  if (establishmentId !== prevEstablishmentId) {
    setPrevEstablishmentId(establishmentId);
    setRequiredHoursOverride(null);
  }

  const { showSuccess, showError } = useSnackbar();
  const { data: establishments } = useGetEstablishmentsQuery();
  const { data: assignments } = useGetAssignmentsQuery(studentId ?? "", {
    skip: !studentId,
  });
  const activeAssignment =
    assignments?.find((a) => a.status === "ACTIVE") ?? null;

  const {
    data: defaults,
    error: defaultsErrorRaw,
    isFetching: isLoadingDefaults,
  } = useGetPlacementDefaultsQuery(
    { studentId: studentId ?? "", establishmentId: establishmentId || undefined },
    { skip: !studentId },
  );
  const defaultsError = defaultsErrorRaw
    ? readError(
        defaultsErrorRaw,
        "Could not load the hours requirement for this student's course/year.",
      )
    : null;

  const { data: blockOptions } = useGetBlocksQuery(
    { courseId: defaults?.courseId, yearLevel: defaults?.yearLevel },
    { skip: !defaults?.courseId },
  );

  const requiredHours =
    requiredHoursOverride ??
    (defaults ? String(defaults.requiredHours) : "");

  const [createPlacement, { isLoading: isSubmitting }] =
    useCreatePlacementMutation();

  const toggleDutyDay = (day: Weekday) => {
    setDutyDays((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day],
    );
  };

  const canSubmit =
    !!studentId &&
    !!establishmentId &&
    dutyDays.length > 0 &&
    !!startDate &&
    !!academicYear &&
    (!activeAssignment || confirmed);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !canSubmit) return;
    setError("");
    try {
      await createPlacement({
        studentId,
        establishmentId,
        dutyDays,
        startDate: new Date(startDate).toISOString(),
        academicYear,
        requiredHours: requiredHours ? Number(requiredHours) : undefined,
        blockId: blockId || undefined,
      }).unwrap();
      showSuccess(
        activeAssignment
          ? "Placement recorded. The previous placement was transferred out."
          : "Placement recorded.",
      );
      onPlaced();
    } catch (err: unknown) {
      const message = readError(err, "Failed to record placement.");
      setError(message);
      showError(message);
    }
  };

  return {
    establishments: establishments ?? [],
    establishmentId,
    setEstablishmentId,
    requiredHours,
    setRequiredHours: (value: string) => {
      setRequiredHoursOverride(value);
    },
    defaults,
    defaultsError,
    isLoadingDefaults,
    dutyDays,
    toggleDutyDay,
    startDate,
    setStartDate,
    academicYear,
    setAcademicYear,
    blockId,
    setBlockId,
    blockOptions: blockOptions ?? [],
    activeAssignment,
    confirmed,
    setConfirmed,
    canSubmit,
    isSubmitting,
    error,
    handleSubmit,
  };
}

function readError(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string | string[] } })?.data;
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message ?? fallback;
}
