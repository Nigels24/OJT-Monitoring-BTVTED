import {
  FileText,
  Info,
  Trash2,
  Upload,
  UploadCloud,
} from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import FileLink from "@/components/ui/FileLink";
import {
  DOCUMENT_STAGE_LABEL,
  type ChecklistRow,
  type DocumentChecklist as Checklist,
  type StudentDocument,
} from "@/lib/api/studentPortalApi";
import {
  REQUIREMENT_STATE_BADGE,
  REQUIREMENT_STATE_LABEL,
} from "@/features/document/components/requirement-state";

interface DocumentChecklistProps {
  checklist: Checklist | undefined;
  isLoading: boolean;
  isError: boolean;
  onUpload: (row: ChecklistRow) => void;
  onDelete: (document: StudentDocument) => void;
}

/**
 * The Table 3 checklist, grouped by stage.
 *
 * Every requirement is listed whether or not it has been uploaded — the point of
 * a checklist is that a missing document is visible. Acceptance and Completion
 * rows read "Available after placement" until a placement exists, because those
 * documents belong to a placement and there is nothing to file them against yet.
 */
export default function DocumentChecklist({
  checklist,
  isLoading,
  isError,
  onUpload,
  onDelete,
}: DocumentChecklistProps) {
  if (isLoading) {
    return <p className="text-gray-400 text-sm">Loading...</p>;
  }
  if (isError || !checklist) {
    return (
      <p className="text-red-600 text-sm py-8 text-center">
        Couldn&apos;t load your requirements. Please refresh to try again.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {!checklist.hasActiveAssignment && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <Info size={16} className="shrink-0 mt-0.5" />
          You have no active placement yet. Application-stage documents can be
          uploaded now; the rest unlock once your coordinator records your
          placement.
        </p>
      )}

      {checklist.stages.map((stage) => (
        <section key={stage.stage}>
          <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-2">
            {DOCUMENT_STAGE_LABEL[stage.stage]}
          </h3>
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
            {stage.requirements.map((row) => (
              <li
                key={row.requirement.id}
                className="p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">
                    {row.requirement.name}
                  </div>
                  {row.document ? (
                    <div className="text-xs text-gray-500 font-mono truncate">
                      {row.document.name}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">
                      {row.requirement.code} · PDF, JPG or PNG, up to 10MB
                    </div>
                  )}
                  {row.document?.status === "REJECTED" &&
                    row.document.reviewNote && (
                      <p className="text-xs text-red-600 mt-1">
                        <span className="font-medium">Returned:</span>{" "}
                        {row.document.reviewNote}
                      </p>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge
                    label={REQUIREMENT_STATE_LABEL[row.state]}
                    variant={REQUIREMENT_STATE_BADGE[row.state]}
                  />
                  {row.document && (
                    <FileLink
                      href={row.document.fileUrl}
                      label={row.document.name}
                    />
                  )}
                  {row.applicable && row.state !== "APPROVED" && (
                    <button
                      onClick={() => onUpload(row)}
                      className="px-2 py-1.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1 text-xs font-medium"
                      aria-label={`${row.document ? "Replace" : "Upload"} ${row.requirement.name}`}
                    >
                      <UploadCloud size={14} />
                      {row.document ? "Replace" : "Upload"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Anything uploaded before the checklist existed, or that the backfill
          could not confidently map to a requirement. Kept visible rather than
          hidden, so nothing a student already submitted disappears. */}
      {checklist.otherUploads.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-2">
            Other uploads
          </h3>
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
            {checklist.otherUploads.map((document) => (
              <li
                key={document.id}
                className="p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 flex items-center gap-1.5">
                    <FileText size={14} className="text-gray-400" />
                    {document.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    Uploaded {new Date(document.uploadedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <FileLink href={document.fileUrl} label={document.name} />
                  {document.status === "PENDING" && (
                    <button
                      onClick={() => onDelete(document)}
                      className="px-2 py-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center gap-1 text-xs font-medium"
                      aria-label={`Delete ${document.name}`}
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-gray-500 flex items-start gap-1.5">
        <Upload size={14} className="shrink-0 mt-0.5" />
        Every file is renamed to StudentNo_CODE_SURNAME and stored privately;
        only you and your coordinator can open it.
      </p>
    </div>
  );
}
