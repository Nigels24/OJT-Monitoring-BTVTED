import { PencilLine, TriangleAlert } from "lucide-react";
import FormDialog from "@/components/ui/FormDialog";
import SelectField from "@/components/ui/SelectField";
import TextArea from "@/components/ui/TextArea";
import Button from "@/components/ui/Button";
import {
  CONCERN_CATEGORIES,
  CONCERN_CATEGORY_LABEL,
  ConcernCategory,
} from "@/lib/api/concernApi";
import type { useRaiseConcern } from "../hooks/use-raise-concern";

type RaiseConcernDialogProps = ReturnType<typeof useRaiseConcern>;

/**
 * A supervisor raising a concern about one trainee to the coordinator.
 *
 * It is recorded against the placement and kept — it is not a chat message,
 * the trainee does not see it, and it is not auto-deleted.
 */
export default function RaiseConcernDialog({
  target,
  category,
  setCategory,
  description,
  setDescription,
  error,
  isSubmitting,
  close,
  handleSubmit,
}: RaiseConcernDialogProps) {
  return (
    <FormDialog
      open={!!target}
      title="Raise a Concern"
      subtitle={target ? `About ${target.traineeName}` : undefined}
      icon={TriangleAlert}
      onClose={close}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
          This goes directly to the OJT coordinator and is kept on the
          trainee&apos;s placement record. The trainee does not see it.
        </p>

        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1.5">
            Category
          </span>
          <SelectField
            value={category}
            onChange={(value) => {
              setCategory(value as ConcernCategory);
            }}
            options={CONCERN_CATEGORIES.map((value) => ({
              value,
              label: CONCERN_CATEGORY_LABEL[value],
            }))}
          />
        </div>

        <TextArea
          label="What is the concern?"
          labelIcon={PencilLine}
          rows={5}
          required
          maxLength={2000}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          placeholder="What happened, when, and what you have already done about it."
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
          <Button type="submit" icon={TriangleAlert} loading={isSubmitting}>
            Send to coordinator
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
