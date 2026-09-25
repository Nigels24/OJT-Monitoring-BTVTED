import { useState } from "react";
import {
  useGetRequirementStatusQuery,
  useReviewDocumentMutation,
  useUploadDocumentForStudentMutation,
  type RequirementCell,
  type RequirementStatusRow,
} from "@/lib/api/documentApi";
import type { DocumentStage } from "@/lib/api/studentPortalApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";

/** What the server accepts, pre-checked so a doomed upload fails faster. */
const ACCEPTED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * The coordinator's Table 3 status matrix: which trainees are missing what,
 * without opening each student.
 *
 * `scope` defaults to "block" — the coordinator's own trainees, switchable to the
 * whole programme (Table 1) — the same toggle the student roster and the journal
 * queue use. Clicking a cell either reviews the document that is there or
 * uploads the one that is missing, so both actions live in this hook.
 */
export function useRequirementStatus() {
  const [scope, setScope] = useState<"block" | "all">("block");
  const [stage, setStage] = useState<DocumentStage | "">("");

  /** The cell whose dialog is open, with the student it belongs to. */
  const [selected, setSelected] = useState<{
    row: RequirementStatusRow;
    cell: RequirementCell;
  } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState("");

  const { showSuccess, showError } = useSnackbar();

  const { data, isLoading, isFetching, isError } = useGetRequirementStatusQuery({
    scope,
    stage,
  });
  const [reviewDocument, { isLoading: isReviewing }] =
    useReviewDocumentMutation();
  const [uploadForStudent, { isLoading: isUploading }] =
    useUploadDocumentForStudentMutation();

  const requirementName = (requirementId: string) =>
    data?.requirements.find((r) => r.id === requirementId)?.name ?? "document";

  const openCell = (row: RequirementStatusRow, cell: RequirementCell) => {
    // Nothing to do for a requirement that isn't due yet — there is no
    // placement to file it against.
    if (cell.state === "NOT_APPLICABLE") return;
    setSelected({ row, cell });
    setFile(null);
    setReviewNote("");
    setError("");
  };

  const closeCell = () => {
    setSelected(null);
    setFile(null);
    setReviewNote("");
    setError("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!picked) return;

    // The server checks the file's real leading bytes; this is only a faster no.
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

  const handleUpload = async () => {
    if (!selected) return;
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }

    const body = new FormData();
    body.append("requirementId", selected.cell.requirementId);
    body.append("file", file);

    try {
      await uploadForStudent({
        studentId: selected.row.student.id,
        body,
      }).unwrap();
      showSuccess(
        `Uploaded ${requirementName(selected.cell.requirementId)} for ${selected.row.student.name}.`,
      );
      closeCell();
    } catch (err: unknown) {
      const message = readError(err, "Failed to upload the document.");
      setError(message);
      showError(message);
    }
  };

  const handleReview = async (status: "APPROVED" | "REJECTED") => {
    if (!selected?.cell.documentId) return;
    setError("");

    // Mirrors the server's MinLength(3) — a returned document with no
    // explanation gives the student nothing to fix.
    if (status === "REJECTED" && reviewNote.trim().length < 3) {
      setError("Give the student a reason so they know what to fix.");
      return;
    }

    try {
      await reviewDocument({
        id: selected.cell.documentId,
        status,
        reviewNote: status === "REJECTED" ? reviewNote.trim() : undefined,
      }).unwrap();
      showSuccess(
        status === "APPROVED" ? "Document approved." : "Document returned.",
      );
      closeCell();
    } catch (err: unknown) {
      const message = readError(err, "Failed to save your review.");
      setError(message);
      showError(message);
    }
  };

  return {
    requirements: data?.requirements ?? [],
    stages: data?.stages ?? [],
    rows: data?.rows ?? [],
    noBlocksAssigned: data?.noBlocksAssigned ?? false,
    isLoading,
    isFetching,
    isError,

    scope,
    stage,
    selected,
    file,
    reviewNote,
    error,
    isUploading,
    isReviewing,

    setScope,
    setStage,
    openCell,
    closeCell,
    setReviewNote,
    handleFileChange,
    handleUpload,
    approve: () => handleReview("APPROVED"),
    reject: () => handleReview("REJECTED"),
    requirementName,
  };
}

function readError(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string | string[] } })?.data;
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message ?? fallback;
}
