import { Check, UploadCloud, X, XCircle } from "lucide-react";
import Overlay from "@/components/ui/Overlay";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import TextArea from "@/components/ui/TextArea";
import type {
  RequirementCell,
  RequirementStatusRow,
} from "@/lib/api/documentApi";
import {
  REQUIREMENT_STATE_BADGE,
  REQUIREMENT_STATE_LABEL,
} from "./requirement-state";

interface RequirementCellDialogProps {
  /** Null closes the dialog. */
  selected: { row: RequirementStatusRow; cell: RequirementCell } | null;
  requirementName: string;
  file: File | null;
  reviewNote: string;
  error: string;
  isUploading: boolean;
  isReviewing: boolean;
  onReviewNoteChange: (value: string) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}

/**
 * One cell of the status matrix, opened.
 *
 * A requirement that has been submitted is reviewed here (approve, or return with
 * written comments the student is notified about). A missing one is uploaded here
 * on the student's behalf, which the school does for the documents it produces
 * itself — those are stored already approved, so there is nothing further to
 * review.
 */
export default function RequirementCellDialog({
  selected,
  requirementName,
  file,
  reviewNote,
  error,
  isUploading,
  isReviewing,
  onReviewNoteChange,
  onFileChange,
  onUpload,
  onApprove,
  onReject,
  onClose,
}: RequirementCellDialogProps) {
  if (!selected) return null;

  const { row, cell } = selected;
  const hasDocument = !!cell.documentId;

  return (
    <Overlay
      open
      label={`${requirementName} for ${row.student.name}`}
      onClose={onClose}
      closeOnBackdrop={false}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {requirementName}
            </h2>
            <p className="text-sm text-gray-600">
              {row.student.name} · {row.student.studentIdNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <StatusBadge
              label={REQUIREMENT_STATE_LABEL[cell.state]}
              variant={REQUIREMENT_STATE_BADGE[cell.state]}
            />
            {cell.submittedAt && (
              <span className="text-xs text-gray-500">
                submitted {new Date(cell.submittedAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {hasDocument ? (
            <>
              <p className="text-sm text-gray-600">
                Open the file from the Review Queue tab to read it, then record
                your decision here.
              </p>
              <TextArea
                label="Comments (required when returning)"
                value={reviewNote}
                onChange={(e) => onReviewNoteChange(e.target.value)}
                placeholder="e.g. The signature page is missing — please re-upload the full document."
                rows={3}
              />
              {error && (
                <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                <div className="sm:w-40">
                  <Button
                    type="button"
                    icon={XCircle}
                    variant="secondary"
                    loading={isReviewing}
                    onClick={onReject}
                  >
                    Return
                  </Button>
                </div>
                <div className="sm:w-40">
                  <Button
                    type="button"
                    icon={Check}
                    loading={isReviewing}
                    onClick={onApprove}
                  >
                    Approve
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Nothing has been submitted yet. Uploading here files the document
                for this student and marks it approved — use it for the documents
                the school issues itself.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  File
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={onFileChange}
                  className="w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {file && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1.5">
                  PDF, JPG or PNG, up to 10MB. It will be renamed to
                  StudentNo_CODE_SURNAME.
                </p>
              </div>
              {error && (
                <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <div className="flex justify-end">
                <div className="sm:w-48">
                  <Button
                    type="button"
                    icon={UploadCloud}
                    loading={isUploading}
                    onClick={onUpload}
                  >
                    Upload for student
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Overlay>
  );
}
