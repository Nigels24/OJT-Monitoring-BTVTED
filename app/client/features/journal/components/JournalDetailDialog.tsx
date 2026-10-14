import {
  Building2,
  CalendarDays,
  Check,
  Images,
  Lightbulb,
  NotebookPen,
  Undo2,
  User,
  X,
} from "lucide-react";
import Overlay from "@/components/ui/Overlay";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import TextArea from "@/components/ui/TextArea";
import type { JournalDetailView } from "@/lib/api/journalApi";
import { formatDateOnly, formatWeekdayOnly } from "@/lib/format";
import {
  JOURNAL_STATUS_LABEL,
  JOURNAL_STATUS_VARIANT,
} from "./journal-status";
import JournalPhotoGallery from "./JournalPhotoGallery";

interface JournalDetailDialogProps {
  /**
   * `null` closes the dialog. The supervisor's payload has no
   * `coordinatorRemarks` at all (stripped server-side), so the remarks block
   * below simply does not render for that role.
   */
  entry: JournalDetailView | null;
  isLoading: boolean;
  onClose: () => void;
  /**
   * Review controls. Omitted entirely for the student's and supervisor's
   * read-only views — the supervisor is deliberately never given them (Table 1).
   */
  review?: {
    remarks: string;
    error: string;
    isSubmitting: boolean;
    onRemarksChange: (value: string) => void;
    onAccept: () => void;
    onReturn: () => void;
  };
}

/**
 * One entry in full: the write-up, its photographs, and — for the coordinator —
 * Accept / Return with written comments.
 */
export default function JournalDetailDialog({
  entry,
  isLoading,
  onClose,
  review,
}: JournalDetailDialogProps) {
  const open = isLoading || entry !== null;
  if (!open) return null;

  return (
    <Overlay
      open
      label="Journal entry"
      onClose={onClose}
      align="stretch"
      closeOnBackdrop={!review}
    >
      <div className="bg-white md:rounded-xl shadow-2xl w-full md:max-w-2xl md:max-h-[90dvh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <NotebookPen size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Journal entry
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {isLoading || !entry ? (
          <p className="p-6 text-sm text-gray-400">Loading entry...</p>
        ) : (
          <div className="p-4 md:p-6 space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <CalendarDays size={15} className="text-blue-600" />
                {formatDateOnly(entry.entryDate)} (
                {formatWeekdayOnly(entry.entryDate)})
              </span>
              <StatusBadge
                label={JOURNAL_STATUS_LABEL[entry.status]}
                variant={JOURNAL_STATUS_VARIANT[entry.status]}
              />
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm space-y-1">
              <div className="flex items-center gap-1.5 text-gray-900 font-medium">
                <User size={14} className="text-gray-400" />
                {entry.student.user.name} · {entry.student.studentIdNumber}
              </div>
              <div className="flex items-center gap-1.5 text-gray-600">
                <Building2 size={14} className="text-gray-400" />
                {entry.trainingAssignment.establishment.name} ·{" "}
                {entry.trainingAssignment.academicYear}
                {entry.trainingAssignment.block
                  ? ` · ${entry.trainingAssignment.block.name}`
                  : ""}
              </div>
            </div>

            <section>
              <h3 className="text-sm font-semibold text-gray-800 mb-1.5">
                Activities performed
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {entry.activities}
              </p>
            </section>

            {entry.learnings && (
              <section>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 mb-1.5">
                  <Lightbulb size={15} className="text-amber-500" />
                  Learnings
                </h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {entry.learnings}
                </p>
              </section>
            )}

            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 mb-2">
                <Images size={15} className="text-blue-600" />
                Photos ({entry.photos.length})
              </h3>
              <JournalPhotoGallery photos={entry.photos} />
            </section>

            {entry.coordinatorRemarks && (
              <section className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <h3 className="text-sm font-semibold text-red-800 mb-1">
                  Coordinator&apos;s comments
                </h3>
                <p className="text-sm text-red-700 whitespace-pre-wrap">
                  {entry.coordinatorRemarks}
                </p>
                {entry.reviewedBy && (
                  <p className="text-xs text-red-600 mt-1">
                    — {entry.reviewedBy.user.name}
                  </p>
                )}
              </section>
            )}

            {review && (
              <section className="border-t border-gray-200 pt-4 space-y-3">
                <TextArea
                  label="Comments (required when returning)"
                  value={review.remarks}
                  onChange={(e) => review.onRemarksChange(e.target.value)}
                  placeholder="e.g. Add photos of the actual task, and describe what you learned."
                  rows={3}
                />
                <p className="text-xs text-gray-500">
                  The student sees these on their Journal page and is notified,
                  so make them specific enough to act on.
                </p>

                {review.error && (
                  <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2">
                    {review.error}
                  </p>
                )}

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                  <div className="sm:w-44">
                    <Button
                      type="button"
                      icon={Undo2}
                      variant="secondary"
                      loading={review.isSubmitting}
                      onClick={review.onReturn}
                    >
                      Return entry
                    </Button>
                  </div>
                  <div className="sm:w-44">
                    <Button
                      type="button"
                      icon={Check}
                      loading={review.isSubmitting}
                      onClick={review.onAccept}
                    >
                      Accept entry
                    </Button>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </Overlay>
  );
}
