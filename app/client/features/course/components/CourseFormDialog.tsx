import { BookOpen, X, Pencil, Plus } from "lucide-react";
import Overlay from "@/components/ui/Overlay";
import TextField from "@/components/ui/TextField";
import Button from "@/components/ui/Button";
import { Course } from "@/lib/api/courseApi";
import type { CourseForm } from "../hooks/use-courses";

interface CourseFormDialogProps {
  open: boolean;
  form: CourseForm;
  editTarget: Course | null;
  isCreating: boolean;
  isUpdating: boolean;
  error: string;
  setField: (key: "code" | "name") => (e: { target: { value: string } }) => void;
  setActive: (isActive: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export default function CourseFormDialog({
  open,
  form,
  editTarget,
  isCreating,
  isUpdating,
  error,
  setField,
  setActive,
  onSubmit,
  onClose,
}: CourseFormDialogProps) {
  if (!open) return null;

  return (
    <Overlay
      open
      label={editTarget ? "Edit Course" : "Add Course"}
      onClose={onClose}
      closeOnBackdrop={false}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              {editTarget ? "Edit Course" : "Add Course"}
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

        <form onSubmit={onSubmit} className="p-4 md:p-6 space-y-4">
          <TextField
            label="Course Code"
            required
            value={form.code}
            onChange={setField("code")}
            placeholder="e.g., BTVTED-CHS"
            maxLength={30}
          />
          <TextField
            label="Program Name"
            required
            value={form.name}
            onChange={setField("name")}
            placeholder="e.g., Bachelor of Technical-Vocational Teacher Education"
            maxLength={200}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => {
                setActive(e.target.checked);
              }}
            />
            Active (selectable for new students/blocks)
          </label>

          {error && (
            <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <div className="sm:w-44">
              <Button
                type="submit"
                icon={editTarget ? Pencil : Plus}
                loading={isCreating || isUpdating}
              >
                {editTarget ? "Save Changes" : "Add Course"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Overlay>
  );
}
