import {
  CalendarDays,
  ImagePlus,
  Info,
  Lightbulb,
  PencilLine,
  Send,
  Trash2,
  X,
} from "lucide-react";
import TextField from "@/components/ui/TextField";
import TextArea from "@/components/ui/TextArea";
import Button from "@/components/ui/Button";
import { MAX_JOURNAL_PHOTOS } from "@/lib/api/journalApi";
import type { JournalEntryDetail } from "@/lib/api/journalApi";
import { formatDateOnly } from "@/lib/format";
import type {
  JournalFormValues,
  PickedPhoto,
} from "../hooks/use-student-journal";

interface JournalEntryFormProps {
  form: JournalFormValues;
  /** Picked but not yet uploaded, each with the blob URL its thumbnail uses. */
  photos: PickedPhoto[];
  photoSlotsLeft: number;
  error: string;
  dutyDayError: string;
  isSubmitting: boolean;
  isEditing: boolean;
  /** The entry being edited, with its stored photos — only set while editing. */
  editDetail: JournalEntryDetail | null;
  isDetailLoading: boolean;
  removePhotoIds: string[];
  minDate?: string;
  maxDate?: string;
  disabled: boolean;
  disabledMessage?: string;
  /** "Mon, Wed, Fri" — the days this placement can be journalled for. */
  dutyDaysLabel?: string;
  setField: (
    key: keyof JournalFormValues,
  ) => (e: { target: { value: string } }) => void;
  onPhotosChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePickedPhoto: (index: number) => void;
  onToggleRemovePhoto: (photoId: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancelEdit: () => void;
}

export default function JournalEntryForm({
  form,
  photos,
  photoSlotsLeft,
  error,
  dutyDayError,
  isSubmitting,
  isEditing,
  editDetail,
  isDetailLoading,
  removePhotoIds,
  minDate,
  maxDate,
  disabled,
  disabledMessage,
  dutyDaysLabel,
  setField,
  onPhotosChange,
  onRemovePickedPhoto,
  onToggleRemovePhoto,
  onSubmit,
  onCancelEdit,
}: JournalEntryFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {isEditing && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-start gap-2">
            <PencilLine size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-900">
              <span className="font-semibold">Editing your entry</span> for{" "}
              {formatDateOnly(form.entryDate)}. Saving replaces it and sends it
              back to your coordinator for review.
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelEdit}
            className="shrink-0 px-3 py-1.5 rounded-lg border border-amber-400 bg-white text-amber-800 text-xs font-medium hover:bg-amber-100"
          >
            Cancel
          </button>
        </div>
      )}

      {disabledMessage && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <Info size={16} className="shrink-0 mt-0.5" />
          {disabledMessage}
        </p>
      )}

      <TextField
        label="Duty day"
        labelIcon={CalendarDays}
        fieldIcon={CalendarDays}
        type="date"
        required
        // Fixed while editing: an edit fixes that day's write-up, it does not
        // move the entry to another day.
        disabled={disabled || isEditing}
        min={minDate}
        max={maxDate}
        value={form.entryDate}
        onChange={setField("entryDate")}
      />
      {dutyDaysLabel && !disabled && (
        <p className="-mt-3 text-xs text-gray-500">
          Your scheduled duty days are {dutyDaysLabel}. Only those days can be
          journalled.
        </p>
      )}
      {dutyDayError && !isEditing && (
        <p className="-mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {dutyDayError}
        </p>
      )}

      <TextArea
        label="What did you do today?"
        labelIcon={PencilLine}
        required
        disabled={disabled}
        value={form.activities}
        onChange={setField("activities")}
        placeholder="Describe the tasks and activities you performed on this duty day."
        rows={5}
      />

      <TextArea
        label="What did you learn? (optional)"
        labelIcon={Lightbulb}
        disabled={disabled}
        value={form.learnings}
        onChange={setField("learnings")}
        placeholder="Skills practised, feedback received, anything you'd do differently."
        rows={3}
      />

      {/* Stored photos, only while editing — removal is staged and applied on save. */}
      {isEditing && (
        <div>
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
            <ImagePlus size={15} className="text-blue-600" />
            Photos already on this entry
          </span>
          {isDetailLoading ? (
            <p className="text-gray-400 text-sm">Loading photos...</p>
          ) : !editDetail || editDetail.photos.length === 0 ? (
            <p className="text-gray-500 text-sm">No photos attached yet.</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {editDetail.photos.map((photo) => {
                const marked = removePhotoIds.includes(photo.id);
                return (
                  <li
                    key={photo.id}
                    className={`relative rounded-lg border overflow-hidden ${
                      marked
                        ? "border-red-300 opacity-50"
                        : "border-gray-200"
                    }`}
                  >
                    {photo.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo.url}
                        alt={photo.originalName}
                        className="w-full h-28 object-cover"
                      />
                    ) : (
                      <div className="w-full h-28 flex items-center justify-center bg-amber-50 text-amber-700 text-xs px-2 text-center">
                        Stored file unavailable
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onToggleRemovePhoto(photo.id)}
                      className="absolute top-1 right-1 p-1 rounded-md bg-white/90 border border-gray-300 text-gray-600 hover:text-red-600"
                      aria-label={
                        marked
                          ? `Keep ${photo.originalName}`
                          : `Remove ${photo.originalName}`
                      }
                    >
                      {marked ? <X size={14} /> : <Trash2 size={14} />}
                    </button>
                    {marked && (
                      <span className="absolute bottom-1 left-1 text-[10px] font-semibold text-red-700 bg-white/90 rounded px-1">
                        Will be removed
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
          <ImagePlus size={15} className="text-blue-600" />
          {isEditing ? "Add more photos" : "Photos"}
        </label>
        <input
          type="file"
          accept="image/jpeg,image/png"
          multiple
          disabled={disabled || photoSlotsLeft === 0}
          onChange={onPhotosChange}
          className="w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
        />
        <p className="text-xs text-gray-500 mt-1.5">
          JPG or PNG, up to 10MB each, {MAX_JOURNAL_PHOTOS} per entry —{" "}
          {photoSlotsLeft} slot{photoSlotsLeft === 1 ? "" : "s"} left. Files are
          renamed and stored privately.
        </p>

        {photos.length > 0 && (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            {photos.map((photo, index) => (
              <li
                key={photo.previewUrl}
                className="relative rounded-lg border border-gray-200 overflow-hidden"
              >
                {/* A local blob URL, so next/image has nothing to optimise. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.previewUrl}
                  alt={photo.file.name}
                  className="w-full h-28 object-cover"
                />
                <button
                  type="button"
                  onClick={() => onRemovePickedPhoto(index)}
                  className="absolute top-1 right-1 p-1 rounded-md bg-white/90 border border-gray-300 text-gray-600 hover:text-red-600"
                  aria-label={`Remove ${photo.file.name}`}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="sm:w-60">
        <Button
          type="submit"
          icon={isEditing ? PencilLine : Send}
          loading={isSubmitting}
          disabled={disabled}
        >
          {isEditing ? "Save and resubmit" : "Submit entry"}
        </Button>
      </div>
    </form>
  );
}
