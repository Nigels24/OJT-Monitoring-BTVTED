import { CheckCircle2, Eye, MessageSquare, TriangleAlert } from "lucide-react";
import FormDialog from "@/components/ui/FormDialog";
import TextArea from "@/components/ui/TextArea";
import { CONCERN_CATEGORY_LABEL, Concern } from "@/lib/api/concernApi";
import ConcernStatusBadge from "./ConcernStatusBadge";

interface ConcernRespondDialogProps {
  concern: Concern | null;
  response: string;
  error: string;
  isSubmitting: boolean;
  onResponseChange: (value: string) => void;
  onAcknowledge: () => void;
  onResolve: () => void;
  onClose: () => void;
}

/**
 * The coordinator reading one concern in full and acknowledging or resolving
 * it, with an optional written response the supervisor will see.
 */
export default function ConcernRespondDialog({
  concern,
  response,
  error,
  isSubmitting,
  onResponseChange,
  onAcknowledge,
  onResolve,
  onClose,
}: ConcernRespondDialogProps) {
  return (
    <FormDialog
      open={!!concern}
      title="Concern"
      subtitle={
        concern
          ? `${concern.student.user.name} · ${concern.trainingAssignment.establishment.name}`
          : undefined
      }
      icon={TriangleAlert}
      onClose={onClose}
    >
      {concern && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">
                {CONCERN_CATEGORY_LABEL[concern.category]}
              </span>{" "}
              · raised by {concern.raisedByName} on{" "}
              {new Date(concern.createdAt).toLocaleDateString()}
            </p>
            <ConcernStatusBadge status={concern.status} />
          </div>

          <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
            {concern.description}
          </p>

          <TextArea
            label="Your response (optional)"
            labelIcon={MessageSquare}
            rows={4}
            maxLength={2000}
            value={response}
            onChange={(e) => {
              onResponseChange(e.target.value);
            }}
            placeholder="What you will do, or what was done. The supervisor sees this; the trainee does not."
          />

          {error && (
            <p
              role="alert"
              className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onAcknowledge}
              disabled={isSubmitting}
              className="h-11 px-4 inline-flex items-center gap-2 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50 text-sm font-semibold disabled:opacity-60"
            >
              <Eye size={16} />
              {concern.status === "ACKNOWLEDGED"
                ? "Save response"
                : "Acknowledge"}
            </button>
            <button
              type="button"
              onClick={onResolve}
              disabled={isSubmitting}
              className="h-11 px-4 inline-flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              <CheckCircle2 size={16} />
              {concern.status === "RESOLVED" ? "Save response" : "Resolve"}
            </button>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
