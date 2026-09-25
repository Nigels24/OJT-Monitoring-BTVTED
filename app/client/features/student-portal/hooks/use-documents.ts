import { useState } from "react";
import {
  useGetMyDocumentsQuery,
  useUploadDocumentMutation,
  useDeleteDocumentMutation,
  type ChecklistRow,
  type StudentDocument,
} from "@/lib/api/studentPortalApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";

/** What the server accepts, pre-checked so a doomed upload fails faster. */
const ACCEPTED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * The student's required-documents checklist (thesis Table 3).
 *
 * Uploading is per requirement — there is no free-text name any more, because
 * the system names the file (`StudentNo_CODE_SURNAME.ext`) from the requirement
 * and the student's own record. Re-uploading a pending or returned requirement
 * replaces the file server-side; an approved one is refused there with a clear
 * message, which is why the button reads "Replace" only while that is allowed.
 */
export function useDocuments() {
  const { data: checklist, isLoading, isError } = useGetMyDocumentsQuery();
  const [uploadDocument, { isLoading: isUploading }] =
    useUploadDocumentMutation();
  const [deleteDocument, { isLoading: isDeleting }] =
    useDeleteDocumentMutation();
  const { showSuccess, showError } = useSnackbar();

  /** The requirement whose upload dialog is open. */
  const [uploadTarget, setUploadTarget] = useState<ChecklistRow | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<StudentDocument | null>(
    null,
  );

  const openUpload = (row: ChecklistRow) => {
    setUploadTarget(row);
    setFile(null);
    setError("");
  };

  const closeUpload = () => {
    setUploadTarget(null);
    setFile(null);
    setError("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!picked) return;

    // The server checks the file's real leading bytes; this only spares the
    // student an upload that was never going to be accepted.
    if (!ACCEPTED_MIME_TYPES.includes(picked.type)) {
      setError("Choose a PDF, JPG or PNG file.");
      setFile(null);
      return;
    }
    if (picked.size > MAX_FILE_SIZE_BYTES) {
      setError("That file is larger than 10MB.");
      setFile(null);
      return;
    }
    setError("");
    setFile(picked);
  };

  const handleUploadConfirm = async () => {
    if (!uploadTarget) return;
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }

    const body = new FormData();
    body.append("requirementId", uploadTarget.requirement.id);
    body.append("file", file);

    try {
      await uploadDocument(body).unwrap();
      showSuccess(
        `${uploadTarget.requirement.name} uploaded and sent for review.`,
      );
      closeUpload();
    } catch (err: unknown) {
      const message = readError(err, "Failed to upload the document.");
      setError(message);
      showError(message);
    }
  };

  const openDelete = (document: StudentDocument) => setDeleteTarget(document);
  const closeDelete = () => setDeleteTarget(null);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDocument(deleteTarget.id).unwrap();
      showSuccess(`Deleted "${deleteTarget.name}".`);
      closeDelete();
    } catch (err: unknown) {
      showError(readError(err, "Failed to delete document."));
    }
  };

  const allRows = (checklist?.stages ?? []).flatMap(
    (stage) => stage.requirements,
  );
  const summary = {
    total: allRows.filter((row) => row.applicable).length,
    approved: allRows.filter((row) => row.state === "APPROVED").length,
    pending: allRows.filter((row) => row.state === "PENDING").length,
    missing: allRows.filter((row) => row.state === "MISSING").length,
    returned: allRows.filter((row) => row.state === "DECLINED").length,
  };

  return {
    checklist,
    summary,
    isLoading,
    isError,

    uploadTarget,
    file,
    error,
    isUploading,
    deleteTarget,
    isDeleting,

    openUpload,
    closeUpload,
    handleFileChange,
    handleUploadConfirm,
    openDelete,
    closeDelete,
    handleDeleteConfirm,
  };
}

function readError(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string | string[] } })?.data;
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message ?? fallback;
}
