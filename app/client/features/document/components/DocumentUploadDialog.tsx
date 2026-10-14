import { UploadCloud, X } from "lucide-react";
import Overlay from "@/components/ui/Overlay";
import Button from "@/components/ui/Button";

interface DocumentUploadDialogProps {
  /** Null closes the dialog. */
  target: { requirementName: string; subtitle?: string; replacing: boolean } | null;
  file: File | null;
  error: string;
  isSubmitting: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Uploading one requirement's file — used by the student for their own documents
 * and by the coordinator uploading on a student's behalf.
 *
 * There is no filename field: the system names the file
 * (`StudentNo_CODE_SURNAME.ext`) from the requirement and the student's record,
 * which is what makes a stored file identifiable without opening it.
 */
export default function DocumentUploadDialog({
  target,
  file,
  error,
  isSubmitting,
  onFileChange,
  onConfirm,
  onCancel,
}: DocumentUploadDialogProps) {
  if (!target) return null;

  return (
    <Overlay open label="Upload document" onClose={onCancel} closeOnBackdrop={false}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <UploadCloud size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              {target.replacing ? "Replace" : "Upload"}{" "}
              {target.requirementName}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-4">
          {target.subtitle && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
              {target.subtitle}
            </div>
          )}

          {target.replacing && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              This replaces the file already on file for this requirement and
              sends it back for review.
            </p>
          )}

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
              PDF, JPG or PNG, up to 10MB. The file&apos;s real type is checked
              on the server, and it will be renamed to the school&apos;s
              convention.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <div className="sm:w-44">
              <Button
                type="button"
                icon={UploadCloud}
                loading={isSubmitting}
                onClick={onConfirm}
              >
                {target.replacing ? "Replace file" : "Upload file"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
