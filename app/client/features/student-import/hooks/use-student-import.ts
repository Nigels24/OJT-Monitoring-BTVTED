import { useMemo, useState } from "react";
import {
  ImportPreview,
  ImportResult,
  MAX_IMPORT_FILE_BYTES,
  useCommitStudentImportMutation,
  useLazyDownloadImportTemplateQuery,
  usePreviewStudentImportMutation,
} from "@/lib/api/studentApi";
import { useGetBlocksQuery } from "@/lib/api/courseApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";

export type ImportStep = "upload" | "preview" | "result";
export type ImportFilter = "all" | "valid" | "errors";

/**
 * The Excel import dialog: download the template, pick a file (and optionally
 * a block), read the server's preview, confirm, read the result.
 *
 * The file is uploaded twice — once to preview, once to commit — and the
 * server judges it from scratch both times; nothing the preview said is sent
 * back. The checks here (extension, size) only spare a pointless upload.
 */
export function useStudentImport(open: boolean, onClose: () => void) {
  const { showSuccess, showError } = useSnackbar();

  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [blockId, setBlockId] = useState("");
  const [fileError, setFileError] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [filter, setFilter] = useState<ImportFilter>("all");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: blocks } = useGetBlocksQuery(undefined, { skip: !open });
  const [triggerTemplate, { isFetching: isDownloading }] =
    useLazyDownloadImportTemplateQuery();
  const [runPreview, { isLoading: isPreviewing }] =
    usePreviewStudentImportMutation();
  const [runCommit, { isLoading: isImporting, reset: resetCommit }] =
    useCommitStudentImportMutation();

  const reset = () => {
    setStep("upload");
    setFile(null);
    setBlockId("");
    setFileError("");
    setError("");
    setPreview(null);
    setFilter("all");
    setResult(null);
    setCopied(false);
    // Drops the commit response — which may hold one-time passwords — from
    // the store as well as from this hook.
    resetCommit();
  };

  const close = () => {
    reset();
    onClose();
  };

  const downloadTemplate = async () => {
    try {
      const { url, filename } = await triggerTemplate().unwrap();
      saveUrl(url, filename);
    } catch (err: unknown) {
      showError(readError(err, "Could not download the template."));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    // Cleared so picking the same file again (after fixing it) still fires.
    e.target.value = "";
    setError("");
    if (!picked) return;
    if (!picked.name.toLowerCase().endsWith(".xlsx")) {
      setFile(null);
      setFileError(
        `"${picked.name}" is not an .xlsx file. Fill in the downloaded template and upload that.`,
      );
      return;
    }
    if (picked.size > MAX_IMPORT_FILE_BYTES) {
      setFile(null);
      setFileError(
        `"${picked.name}" is ${(picked.size / (1024 * 1024)).toFixed(1)}MB — the limit is 2MB.`,
      );
      return;
    }
    setFileError("");
    setFile(picked);
  };

  const buildBody = () => {
    const body = new FormData();
    body.append("file", file as File);
    body.append("blockId", blockId);
    return body;
  };

  const handlePreview = async () => {
    if (!file) {
      setFileError("Choose the filled-in .xlsx file first.");
      return;
    }
    setError("");
    try {
      setPreview(await runPreview(buildBody()).unwrap());
      setFilter("all");
      setStep("preview");
    } catch (err: unknown) {
      setError(readError(err, "The file could not be read."));
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setError("");
    try {
      const outcome = await runCommit(buildBody()).unwrap();
      setResult(outcome);
      setStep("result");
      if (outcome.created > 0) {
        showSuccess(
          `${outcome.created} student${outcome.created === 1 ? "" : "s"} imported.`,
        );
      }
    } catch (err: unknown) {
      const message = readError(err, "The import failed. Nothing was created.");
      setError(message);
      showError(message);
    }
  };

  const backToUpload = () => {
    setStep("upload");
    setPreview(null);
    setError("");
  };

  const visibleRows = useMemo(() => {
    const rows = preview?.rows ?? [];
    if (filter === "valid") return rows.filter((row) => row.status === "VALID");
    if (filter === "errors") return rows.filter((row) => row.status === "ERROR");
    return rows;
  }, [preview, filter]);

  /** The rejected rows as a small CSV: row number and reasons. Built here. */
  const downloadRejected = () => {
    if (!result || result.rejected.length === 0) return;
    const lines = [
      ["Row", "Student No.", "Reasons"],
      ...result.rejected.map((row) => [
        String(row.rowNumber),
        row.studentNumber,
        row.reasons.join("; "),
      ]),
    ].map((cells) => cells.map(csvCell).join(","));
    // The BOM makes Excel read the file as UTF-8.
    const blob = new Blob(["﻿" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    saveUrl(URL.createObjectURL(blob), "student-import-rejected-rows.csv");
  };

  const copyCredentials = async () => {
    if (!result?.credentials) return;
    const text = [
      `Web address: ${window.location.origin}`,
      "",
      ...result.credentials.map(
        (c) =>
          `${c.studentNumber}\t${c.name}\tLogin ID: ${c.loginId}\tTemporary password: ${c.temporaryPassword}`,
      ),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      showError("Could not copy. Select the list and copy it by hand.");
    }
  };

  return {
    step,
    close,

    blockOptions: (blocks ?? []).map((block) => ({
      value: block.id,
      label: `${block.course ? `${block.course.code} · ` : ""}${block.name} · Year ${block.yearLevel} · ${block.academicYear}`,
    })),
    blockId,
    setBlockId,

    file,
    fileError,
    error,
    isDownloading,
    isPreviewing,
    isImporting,
    downloadTemplate,
    handleFileChange,
    handlePreview,

    preview,
    filter,
    setFilter,
    visibleRows,
    backToUpload,
    handleImport,

    result,
    copied,
    downloadRejected,
    copyCredentials,
  };
}

/** Clicks a temporary link to save `url`, then lets go of it. */
function saveUrl(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking in the same tick can cancel the save in some browsers.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

/**
 * One CSV cell: quoted, with quotes doubled. A leading =, +, - or @ is
 * prefixed with an apostrophe so a spreadsheet does not run it as a formula —
 * the reasons quote text that came from the uploaded file.
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function readError(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string | string[] } })?.data;
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message ?? fallback;
}
