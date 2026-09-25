import { useState } from "react";
import {
  useGetJournalsForReviewQuery,
  useGetJournalForReviewQuery,
  useReviewJournalEntryMutation,
  type JournalListRow,
  type JournalStatus,
} from "@/lib/api/journalApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";

/**
 * The coordinator's journal review queue.
 *
 * Filtering and paging happen server-side (the queue spans every block and can
 * grow to thousands of entries), unlike the documents queue which filters a
 * single fetched list in memory. `scope` defaults to "block" — the coordinator's
 * own trainees, switchable to the whole programme (Table 1), the same toggle the
 * student roster and the overdue widget use.
 */
export function useJournalReview() {
  const [scope, setScope] = useState<"block" | "all">("block");
  // Defaults to SUBMITTED: this screen exists to clear the queue.
  const [statusFilter, setStatusFilter] = useState<JournalStatus | "">(
    "SUBMITTED",
  );
  const [establishmentId, setEstablishmentId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [reviewError, setReviewError] = useState("");

  const { showSuccess, showError } = useSnackbar();

  const { data, isLoading, isFetching, isError } = useGetJournalsForReviewQuery({
    scope,
    status: statusFilter,
    establishmentId,
    from,
    to,
    page,
  });
  const { data: detail, isFetching: isDetailLoading } =
    useGetJournalForReviewQuery(detailId ?? "", { skip: !detailId });
  const [reviewEntry, { isLoading: isReviewing }] =
    useReviewJournalEntryMutation();

  /** Any filter change resets to page 1 — page 6 of a narrower result set is empty. */
  const withPageReset =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  const openDetail = (row: JournalListRow) => {
    setDetailId(row.id);
    setRemarks("");
    setReviewError("");
  };

  const closeDetail = () => {
    setDetailId(null);
    setRemarks("");
    setReviewError("");
  };

  const submitReview = async (decision: "ACCEPT" | "RETURN") => {
    if (!detailId) return;
    setReviewError("");

    // Mirrors the server's MinLength(3) — a returned entry with no explanation
    // gives the student nothing to fix.
    if (decision === "RETURN" && remarks.trim().length < 3) {
      setReviewError(
        "Write what needs changing — the student sees this and is notified.",
      );
      return;
    }

    try {
      await reviewEntry({
        id: detailId,
        decision,
        remarks: decision === "RETURN" ? remarks.trim() : undefined,
      }).unwrap();
      showSuccess(
        decision === "ACCEPT" ? "Entry accepted." : "Entry returned to student.",
      );
      closeDetail();
    } catch (err: unknown) {
      const message = readError(err, "Failed to save your review.");
      setReviewError(message);
      showError(message);
    }
  };

  return {
    rows: data?.rows ?? [],
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 1,
    awaitingReview: data?.awaitingReview ?? 0,
    noBlocksAssigned: data?.noBlocksAssigned ?? false,
    isLoading,
    isFetching,
    isError,

    scope,
    statusFilter,
    establishmentId,
    from,
    to,
    page,

    detail: detailId && detail?.id === detailId ? detail : null,
    isDetailOpen: detailId !== null,
    isDetailLoading,
    remarks,
    reviewError,
    isReviewing,

    setScope: withPageReset(setScope),
    setStatusFilter: withPageReset(setStatusFilter),
    setEstablishmentId: withPageReset(setEstablishmentId),
    setFrom: withPageReset(setFrom),
    setTo: withPageReset(setTo),
    setPage,
    setRemarks,

    openDetail,
    closeDetail,
    accept: () => submitReview("ACCEPT"),
    returnEntry: () => submitReview("RETURN"),
  };
}

function readError(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string | string[] } })?.data;
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message ?? fallback;
}
