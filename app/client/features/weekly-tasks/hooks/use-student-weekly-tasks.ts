import { useState } from "react";
import {
  ACCEPTED_PHOTO_MIME_TYPES,
  MAX_PHOTO_SIZE_BYTES,
} from "@/lib/api/journalApi";
import {
  MAX_TASK_PHOTOS,
  WeeklyTask,
  useGetMyWeekQuery,
  useMarkWeeklyTaskDoneMutation,
  useUndoWeeklyTaskDoneMutation,
} from "@/lib/api/weeklyTaskApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";
import { manilaTodayKey, readApiError, shiftWeek, weekStartKey } from "../week";

/** A photo picked in the browser but not yet uploaded. */
export interface PickedTaskPhoto {
  file: File;
  /** A local blob URL for the thumbnail; revoked when the photo is dropped. */
  previewUrl: string;
}

/**
 * The student's Weekly Tasks page: one week of their own tasks, marking one
 * done with a note and proof photos, and undoing that before it is rated.
 *
 * The file checks here only spare the student an upload that was never going
 * to be accepted — the server decides from the file's real bytes.
 */
export function useStudentWeeklyTasks(initial: { week: string | null }) {
  const { showSuccess, showError } = useSnackbar();

  const currentWeek = weekStartKey(manilaTodayKey());
  const [week, setWeek] = useState(() => weekStartKey(initial.week));

  const {
    data,
    isLoading,
    isFetching,
    error: loadErrorRaw,
  } = useGetMyWeekQuery({ week });

  const [markDone, { isLoading: isSubmitting }] =
    useMarkWeeklyTaskDoneMutation();
  const [undoDone] = useUndoWeeklyTaskDoneMutation();

  /* ---- mark as done ---- */
  const [doneTarget, setDoneTarget] = useState<WeeklyTask | null>(null);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<PickedTaskPhoto[]>([]);
  /** Files the picker refused, each with its reason — shown as a list. */
  const [photoErrors, setPhotoErrors] = useState<string[]>([]);
  const [doneError, setDoneError] = useState("");

  const clearPhotos = () => {
    setPhotos((current) => {
      current.forEach((photo) => {
        URL.revokeObjectURL(photo.previewUrl);
      });
      return [];
    });
  };

  const openDone = (task: WeeklyTask) => {
    setDoneTarget(task);
    setNote("");
    clearPhotos();
    setPhotoErrors([]);
    setDoneError("");
  };

  const closeDone = () => {
    setDoneTarget(null);
    clearPhotos();
  };

  const handlePhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    // Cleared so re-picking the same file after removing it works.
    e.target.value = "";
    if (picked.length === 0) return;

    const rejected: string[] = [];
    const accepted: File[] = [];
    for (const file of picked) {
      if (!ACCEPTED_PHOTO_MIME_TYPES.includes(file.type)) {
        rejected.push(`${file.name} — not a JPG or PNG image`);
      } else if (file.size > MAX_PHOTO_SIZE_BYTES) {
        rejected.push(
          `${file.name} — ${(file.size / (1024 * 1024)).toFixed(1)}MB, over the 10MB limit`,
        );
      } else {
        accepted.push(file);
      }
    }

    const room = Math.max(0, MAX_TASK_PHOTOS - photos.length);
    const withinLimit = accepted.slice(0, room);
    for (const file of accepted.slice(room)) {
      rejected.push(
        `${file.name} — only ${MAX_TASK_PHOTOS} photos are allowed per task`,
      );
    }

    setPhotos((current) => [
      ...current,
      ...withinLimit.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
    setPhotoErrors(rejected);
  };

  const removePhoto = (index: number) => {
    setPhotos((current) => {
      const removed = current[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((_, i) => i !== index);
    });
  };

  const handleDoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doneTarget) return;
    setDoneError("");

    const body = new FormData();
    body.append("note", note.trim());
    photos.forEach((photo) => body.append("photos", photo.file));

    try {
      await markDone({ id: doneTarget.id, body }).unwrap();
      showSuccess("Task marked as done. Your supervisor has been notified.");
      setDoneTarget(null);
      clearPhotos();
    } catch (err: unknown) {
      const message = readApiError(err, "Failed to mark the task as done.");
      setDoneError(message);
      showError(message);
    }
  };

  /* ---- undo ---- */
  const [undoTarget, setUndoTarget] = useState<WeeklyTask | null>(null);

  const handleUndoConfirm = async () => {
    if (!undoTarget) return;
    try {
      await undoDone(undoTarget.id).unwrap();
      showSuccess("Task moved back to Assigned.");
    } catch (err: unknown) {
      showError(readApiError(err, "Failed to undo."));
    } finally {
      setUndoTarget(null);
    }
  };

  return {
    week,
    isCurrentWeek: week === currentWeek,
    goPrevWeek: () => setWeek((current) => shiftWeek(current, -1)),
    goNextWeek: () => setWeek((current) => shiftWeek(current, 1)),
    goThisWeek: () => setWeek(currentWeek),

    data,
    isLoading: isLoading || isFetching,
    loadError: loadErrorRaw
      ? readApiError(loadErrorRaw, "Could not load your tasks.")
      : "",

    doneTarget,
    note,
    setNote,
    photos,
    photoSlotsLeft: Math.max(0, MAX_TASK_PHOTOS - photos.length),
    photoErrors,
    doneError,
    isSubmitting,
    openDone,
    closeDone,
    handlePhotosChange,
    removePhoto,
    handleDoneSubmit,

    undoTarget,
    setUndoTarget,
    handleUndoConfirm,
  };
}
