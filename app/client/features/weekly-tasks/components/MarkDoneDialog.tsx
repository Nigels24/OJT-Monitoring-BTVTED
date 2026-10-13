import { AlertCircle, CheckCircle2, ImagePlus, PencilLine, X } from "lucide-react";
import FormDialog from "@/components/ui/FormDialog";
import TextArea from "@/components/ui/TextArea";
import Button from "@/components/ui/Button";
import { MAX_TASK_PHOTOS, WeeklyTask } from "@/lib/api/weeklyTaskApi";
import type { PickedTaskPhoto } from "../hooks/use-student-weekly-tasks";

interface MarkDoneDialogProps {
  task: WeeklyTask | null;
  note: string;
  photos: PickedTaskPhoto[];
  photoSlotsLeft: number;
  /** Files the picker refused, each with its reason. */
  photoErrors: string[];
  error: string;
  isSubmitting: boolean;
  onNoteChange: (note: string) => void;
  onPhotosChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (index: number) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

/** Mark a task done, with an optional note and optional proof photos. */
export default function MarkDoneDialog({
  task,
  note,
  photos,
  photoSlotsLeft,
  photoErrors,
  error,
  isSubmitting,
  onNoteChange,
  onPhotosChange,
  onRemovePhoto,
  onSubmit,
  onClose,
}: MarkDoneDialogProps) {
  return (
    <FormDialog
      open={!!task}
      title="Mark as Done"
      subtitle={task?.title}
      icon={CheckCircle2}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <TextArea
          label="Note (optional)"
          labelIcon={PencilLine}
          rows={4}
          maxLength={1000}
          value={note}
          onChange={(e) => {
            onNoteChange(e.target.value);
          }}
          placeholder="What you did, and anything your supervisor should know."
        />

        <div>
          <label
            htmlFor="task-proof-photos"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5"
          >
            <ImagePlus size={15} className="text-blue-600" />
            Proof photos (optional)
          </label>
          <input
            id="task-proof-photos"
            type="file"
            accept="image/jpeg,image/png"
            multiple
            disabled={photoSlotsLeft === 0}
            onChange={onPhotosChange}
            className="w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
          />
          <p className="text-xs text-gray-500 mt-1.5">
            JPG or PNG only, up to 10MB each, {MAX_TASK_PHOTOS} per task —{" "}
            {photoSlotsLeft} slot{photoSlotsLeft === 1 ? "" : "s"} left. Files
            are renamed and stored privately.
          </p>

          {photoErrors.length > 0 && (
            <div
              role="alert"
              className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              <p className="font-medium flex items-center gap-1.5">
                <AlertCircle size={15} />
                {photoErrors.length === 1
                  ? "This file was not added:"
                  : "These files were not added:"}
              </p>
              <ul className="list-disc pl-6 mt-1 space-y-0.5">
                {photoErrors.map((message) => (
                  <li key={message} className="break-words">
                    {message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {photos.length > 0 && (
            <ul className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
              {photos.map((photo, index) => (
                <li
                  key={photo.previewUrl}
                  className="relative rounded-md border border-gray-200 overflow-hidden"
                >
                  {/* A local blob URL, so next/image has nothing to optimise. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.previewUrl}
                    alt={photo.file.name}
                    className="w-full h-20 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onRemovePhoto(index);
                    }}
                    className="absolute top-1 right-1 p-1 rounded-md bg-white/90 border border-gray-300 text-gray-600 hover:text-red-600"
                    aria-label={`Remove ${photo.file.name}`}
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}

        <div className="sm:w-60">
          <Button type="submit" icon={CheckCircle2} loading={isSubmitting}>
            Mark as done
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
