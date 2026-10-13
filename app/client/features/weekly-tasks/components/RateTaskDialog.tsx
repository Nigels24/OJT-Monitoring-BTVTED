import { MessageSquare, Star } from "lucide-react";
import FormDialog from "@/components/ui/FormDialog";
import TextArea from "@/components/ui/TextArea";
import Button from "@/components/ui/Button";
import {
  MAX_TASK_RATING,
  MIN_TASK_RATING,
  WeeklyTask,
} from "@/lib/api/weeklyTaskApi";
import TaskPhotos from "./TaskPhotos";

interface RateTaskDialogProps {
  task: WeeklyTask | null;
  rating: number | null;
  comment: string;
  error: string;
  isSaving: boolean;
  onRatingChange: (rating: number) => void;
  onCommentChange: (comment: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

const RATINGS = Array.from(
  { length: MAX_TASK_RATING - MIN_TASK_RATING + 1 },
  (_, index) => MIN_TASK_RATING + index,
);

/**
 * Rate a task the trainee has marked done, or correct a rating already given.
 *
 * The trainee's note and proof photos are shown above the selector, since they
 * are what is being rated.
 */
export default function RateTaskDialog({
  task,
  rating,
  comment,
  error,
  isSaving,
  onRatingChange,
  onCommentChange,
  onSubmit,
  onClose,
}: RateTaskDialogProps) {
  return (
    <FormDialog
      open={!!task}
      title={task?.status === "RATED" ? "Update Rating" : "Rate Task"}
      subtitle={task?.title}
      icon={Star}
      onClose={onClose}
    >
      {task && (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Submitted by the trainee
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {task.studentNote || "No note was written."}
            </p>
            {task.photos.length > 0 ? (
              <TaskPhotos photos={task.photos} />
            ) : (
              <p className="text-xs text-gray-500">
                No proof photos were attached.
              </p>
            )}
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-1.5">
              Rating ({MIN_TASK_RATING} lowest – {MAX_TASK_RATING} highest)
            </legend>
            <div className="flex gap-2">
              {RATINGS.map((value) => {
                const selected = rating === value;
                return (
                  <label
                    key={value}
                    className={`w-11 h-11 rounded-md border text-sm font-semibold flex items-center justify-center cursor-pointer transition-colors ${
                      selected
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-gray-300 text-gray-600 hover:bg-blue-50 hover:border-blue-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="task-rating"
                      value={value}
                      checked={selected}
                      onChange={() => {
                        onRatingChange(value);
                      }}
                      className="sr-only"
                    />
                    {value}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              A weekly rating is recorded on its own. It does not change the
              official evaluation sheet.
            </p>
          </fieldset>

          <TextArea
            label="Comment (optional)"
            labelIcon={MessageSquare}
            rows={3}
            maxLength={500}
            value={comment}
            onChange={(e) => {
              onCommentChange(e.target.value);
            }}
            placeholder="A short note for the trainee."
          />

          {error && (
            <p
              role="alert"
              className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2"
            >
              {error}
            </p>
          )}

          <div className="sm:w-60">
            <Button type="submit" icon={Star} loading={isSaving}>
              {task.status === "RATED" ? "Save rating" : "Rate task"}
            </Button>
          </div>
        </form>
      )}
    </FormDialog>
  );
}
