import { useState } from "react";
import {
  Concern,
  ConcernStatus,
  useGetConcernsQuery,
  useRespondToConcernMutation,
} from "@/lib/api/concernApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";
import { readError } from "./use-raise-concern";

/**
 * The coordinator's Concerns page: the list with its scope and status
 * filters, and responding to one. `scope` defaults to "block" — the same
 * My Block / All Program toggle the journal queue and the roster use.
 */
export function useConcernReview() {
  const { showSuccess, showError } = useSnackbar();
  const [scope, setScope] = useState<"block" | "all">("block");
  // Defaults to OPEN: this page exists to clear what is waiting.
  const [statusFilter, setStatusFilter] = useState<ConcernStatus | "">("OPEN");

  const { data, isLoading, isFetching, isError } = useGetConcernsQuery({
    scope,
    status: statusFilter,
  });
  const [respond, { isLoading: isResponding }] = useRespondToConcernMutation();

  const [target, setTarget] = useState<Concern | null>(null);
  const [response, setResponse] = useState("");
  const [error, setError] = useState("");

  const openRespond = (concern: Concern) => {
    setTarget(concern);
    setResponse(concern.coordinatorResponse ?? "");
    setError("");
  };

  const closeRespond = () => {
    setTarget(null);
  };

  const submit = async (status: "ACKNOWLEDGED" | "RESOLVED") => {
    if (!target) return;
    setError("");
    try {
      await respond({
        id: target.id,
        status,
        // Always sent, so clearing the box clears the stored response.
        response: response.trim() || null,
      }).unwrap();
      showSuccess(
        status === "RESOLVED"
          ? "Concern resolved. The supervisor has been notified."
          : "Concern acknowledged. The supervisor has been notified.",
      );
      setTarget(null);
    } catch (err: unknown) {
      const message = readError(err, "Failed to save your response.");
      setError(message);
      showError(message);
    }
  };

  return {
    scope,
    setScope,
    statusFilter,
    setStatusFilter,
    concerns: data?.concerns ?? [],
    noBlocksAssigned: data?.noBlocksAssigned ?? false,
    isLoading: isLoading || isFetching,
    isError,

    target,
    response,
    setResponse,
    error,
    isResponding,
    openRespond,
    closeRespond,
    acknowledge: () => submit("ACKNOWLEDGED"),
    resolve: () => submit("RESOLVED"),
  };
}
