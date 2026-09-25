import { useMemo, useState, useSyncExternalStore } from "react";
import {
  useGetMyJournalsQuery,
  useCreateJournalEntryMutation,
  useUpdateJournalEntryMutation,
  useDeleteJournalEntryMutation,
  useGetMyJournalEntryQuery,
  ACCEPTED_PHOTO_MIME_TYPES,
  MAX_JOURNAL_PHOTOS,
  MAX_PHOTO_SIZE_BYTES,
  type JournalStatus,
  type StudentJournalEntry,
} from "@/lib/api/journalApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";

const EMPTY_FORM = { entryDate: "", activities: "", learnings: "" };

export type JournalFormValues = typeof EMPTY_FORM;

/**
 * A photo the student has picked but not yet uploaded, with the blob URL its
 * thumbnail renders from.
 *
 * The URL is minted when the file is picked and revoked when it is removed —
 * deriving it in an effect would mean a second render pass for every pick, which
 * this project's lint rules (rightly) reject. Blob URLs are scoped to the
 * document, so any left over when the student navigates away go with it.
 */
export interface PickedPhoto {
  file: File;
  previewUrl: string;
}

const subscribeToNothing = () => () => {};

/** JS `getUTCDay()` (0 = Sunday) to the Weekday values the API uses. */
const WEEKDAY_BY_JS_DAY = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
] as const;

const WEEKDAY_LABELS: Record<string, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

/**
 * Today as `yyyy-mm-dd` in the browser's own zone, never via `toISOString()` —
 * that converts to UTC first and shows yesterday to anyone in Asia/Manila
 * logging before 08:00. Same helper the attendance form uses.
 */
function todayLocalDateString(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** `yyyy-mm-dd` -> "Dec 1, 2026", read as UTC so no local shift applies. */
function formatDateLabel(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The student's journal: the list, the write/edit form, and its photos.
 *
 * Every rule checked here is also enforced server-side — this is UX only, so a
 * student sees why before uploading rather than after. The wording deliberately
 * mirrors the server's (`journal.service.ts`, `common/duty-days.ts`).
 */
export function useStudentJournal() {
  const { data, isLoading, isError } = useGetMyJournalsQuery();
  const [createEntry, { isLoading: isCreating }] =
    useCreateJournalEntryMutation();
  const [updateEntry, { isLoading: isUpdating }] =
    useUpdateJournalEntryMutation();
  const [deleteEntry, { isLoading: isDeleting }] =
    useDeleteJournalEntryMutation();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<JournalFormValues>(EMPTY_FORM);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<JournalStatus | "">("");
  /** Set while editing an existing SUBMITTED/RETURNED entry instead of writing a new day. */
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  /** Ids of the editing entry's existing photos the student has marked for removal. */
  const [removePhotoIds, setRemovePhotoIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<StudentJournalEntry | null>(
    null,
  );
  /** The entry open in the read-only viewer (photos and full text). */
  const [viewTargetId, setViewTargetId] = useState<string | null>(null);

  const assignment = data?.assignment ?? null;
  const entries = data?.entries ?? [];

  // The editing entry's stored photos need signed URLs, which only the detail
  // endpoint mints — the list ships counts. Same request serves the viewer.
  const detailId = editTargetId ?? viewTargetId;
  const { data: detail, isFetching: isDetailLoading } =
    useGetMyJournalEntryQuery(detailId ?? "", { skip: !detailId });
  const editDetail = editTargetId && detail?.id === editTargetId ? detail : null;
  const viewDetail = viewTargetId && detail?.id === viewTargetId ? detail : null;

  const today = todayLocalDateString();
  const startDate = assignment?.startDate?.slice(0, 10);
  const isEditing = editTargetId !== null;

  /**
   * The date field defaults to today, seeded on the first *client* render rather
   * than in the initial state: the server render reads the server's calendar day
   * (UTC in production, Manila in the browser), and prerendering that value
   * would disagree with the browser's own day at hydration. This is the
   * render-phase "adjusting state when a value changes" pattern, the same one
   * `Overlay` uses — not an effect, which would cost a second render pass.
   */
  const isClient = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const [dateSeeded, setDateSeeded] = useState(false);
  if (isClient && !dateSeeded) {
    setDateSeeded(true);
    if (!form.entryDate) {
      setForm((f) => ({ ...f, entryDate: todayLocalDateString() }));
    }
  }

  const setField =
    (key: keyof JournalFormValues) => (e: { target: { value: string } }) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
    };

  const clearPickedPhotos = () => {
    setPhotos((current) => {
      current.forEach((photo) => {
        URL.revokeObjectURL(photo.previewUrl);
      });
      return [];
    });
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, entryDate: today });
    clearPickedPhotos();
    setRemovePhotoIds([]);
    setEditTargetId(null);
    setError("");
  };

  /** Loads an entry into the form. Its date is fixed — an edit fixes that day's write-up. */
  const startEdit = (entry: StudentJournalEntry) => {
    setEditTargetId(entry.id);
    setViewTargetId(null);
    setRemovePhotoIds([]);
    clearPickedPhotos();
    setError("");
    setForm({
      entryDate: entry.entryDate.slice(0, 10),
      activities: entry.activities,
      learnings: entry.learnings ?? "",
    });
  };

  const cancelEdit = () => {
    resetForm();
  };

  const openView = (entry: StudentJournalEntry) => {
    setViewTargetId(entry.id);
  };
  const closeView = () => setViewTargetId(null);

  const toggleRemovePhoto = (photoId: string) => {
    setRemovePhotoIds((ids) =>
      ids.includes(photoId)
        ? ids.filter((id) => id !== photoId)
        : [...ids, photoId],
    );
  };

  /** How many photos the entry would end up with, kept plus newly picked. */
  const keptPhotoCount = editDetail
    ? editDetail.photos.filter((photo) => !removePhotoIds.includes(photo.id))
        .length
    : 0;
  const photoSlotsLeft = Math.max(
    0,
    MAX_JOURNAL_PHOTOS - keptPhotoCount - photos.length,
  );

  const handlePhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    // The input is cleared so re-picking the same file after removing it works.
    e.target.value = "";
    if (picked.length === 0) return;

    const rejected: string[] = [];
    const accepted: File[] = [];
    for (const file of picked) {
      // The server checks the file's real magic bytes; this only spares the
      // student an upload that was never going to be accepted.
      if (!ACCEPTED_PHOTO_MIME_TYPES.includes(file.type)) {
        rejected.push(`${file.name} is not a JPG or PNG`);
      } else if (file.size > MAX_PHOTO_SIZE_BYTES) {
        rejected.push(`${file.name} is larger than 10MB`);
      } else {
        accepted.push(file);
      }
    }

    const room = MAX_JOURNAL_PHOTOS - keptPhotoCount - photos.length;
    const withinLimit = accepted.slice(0, Math.max(0, room));
    if (accepted.length > withinLimit.length) {
      rejected.push(`only ${MAX_JOURNAL_PHOTOS} photos are allowed per entry`);
    }

    setPhotos((current) => [
      ...current,
      ...withinLimit.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
    setError(rejected.length > 0 ? `Skipped: ${rejected.join("; ")}.` : "");
  };

  const removePickedPhoto = (index: number) => {
    setPhotos((current) => {
      const removed = current[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((_, i) => i !== index);
    });
  };

  /* Which of the five states the form is in, mirroring the server's own checks. */
  const isUnassigned = !!data && !assignment;
  const isNotStarted = !!startDate && !isUnassigned && today < startDate;
  const isDisabled = isUnassigned || isNotStarted;
  const disabledMessage = isUnassigned
    ? "You have no active placement yet, so there is nothing to journal against. Contact your coordinator."
    : isNotStarted
      ? `Your placement starts on ${formatDateLabel(startDate!)}. You can write journal entries from then.`
      : undefined;

  /** The duty-day rule, with the server's own wording. */
  const dutyDayError = useMemo(() => {
    if (!form.entryDate || !assignment) return "";
    const weekday =
      WEEKDAY_BY_JS_DAY[
        new Date(`${form.entryDate}T00:00:00Z`).getUTCDay() as 0
      ];
    if (assignment.dutyDays.includes(weekday)) return "";
    return `${WEEKDAY_LABELS[weekday]} is not one of your scheduled duty days (${assignment.dutyDaysLabel}).`;
  }, [form.entryDate, assignment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isDisabled) {
      setError(disabledMessage ?? "Journal entries are unavailable right now.");
      return;
    }
    if (!form.entryDate) {
      setError("Pick the duty day you are writing up.");
      return;
    }
    if (form.entryDate > today) {
      setError("A journal entry cannot be written for a future date.");
      return;
    }
    if (startDate && form.entryDate < startDate) {
      setError(
        `Your placement starts on ${formatDateLabel(startDate)}. You cannot journal a day before then.`,
      );
      return;
    }
    if (dutyDayError) {
      setError(dutyDayError);
      return;
    }
    if (!form.activities.trim()) {
      setError("Describe what you did on this duty day.");
      return;
    }

    const body = new FormData();
    body.append("activities", form.activities.trim());
    body.append("learnings", form.learnings.trim());
    photos.forEach((photo) => body.append("photos", photo.file));

    try {
      if (isEditing && editTargetId) {
        if (removePhotoIds.length > 0) {
          body.append("removePhotoIds", removePhotoIds.join(","));
        }
        await updateEntry({ id: editTargetId, body }).unwrap();
        showSuccess(
          "Entry updated and sent back to your coordinator for review.",
        );
      } else {
        body.append("entryDate", form.entryDate);
        await createEntry(body).unwrap();
        showSuccess("Journal entry submitted for review.");
      }
      resetForm();
    } catch (err: unknown) {
      const message = readError(
        err,
        isEditing ? "Failed to update entry." : "Failed to submit entry.",
      );
      setError(message);
      showError(message);
    }
  };

  const openDelete = (entry: StudentJournalEntry) => setDeleteTarget(entry);
  const closeDelete = () => setDeleteTarget(null);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEntry(deleteTarget.id).unwrap();
      showSuccess("Journal entry deleted.");
      if (editTargetId === deleteTarget.id) resetForm();
      closeDelete();
    } catch (err: unknown) {
      showError(readError(err, "Failed to delete entry."));
    }
  };

  const filtered = statusFilter
    ? entries.filter((entry) => entry.status === statusFilter)
    : entries;

  const summary = {
    total: entries.length,
    submitted: entries.filter((e) => e.status === "SUBMITTED").length,
    accepted: entries.filter((e) => e.status === "ACCEPTED").length,
    returned: entries.filter((e) => e.status === "RETURNED").length,
  };

  return {
    assignment,
    entries: filtered,
    summary,
    isLoading,
    isError,

    form,
    photos,
    photoSlotsLeft,
    error,
    dutyDayError,
    isDisabled,
    disabledMessage,
    minDate: isDisabled ? undefined : startDate,
    maxDate: isDisabled ? undefined : today,
    isSubmitting: isCreating || isUpdating,
    isEditing,
    editDetail,
    isDetailLoading,
    removePhotoIds,

    statusFilter,
    deleteTarget,
    isDeleting,
    viewDetail,
    isViewOpen: viewTargetId !== null,

    setField,
    setStatusFilter,
    handlePhotosChange,
    removePickedPhoto,
    toggleRemovePhoto,
    handleSubmit,
    startEdit,
    cancelEdit,
    openView,
    closeView,
    openDelete,
    closeDelete,
    handleDeleteConfirm,
  };
}

function readError(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string | string[] } })?.data;
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message ?? fallback;
}
