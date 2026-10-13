import { useState } from "react";
import {
  ConcernCategory,
  useRaiseConcernMutation,
} from "@/lib/api/concernApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";

/** Who a concern is about — a placement, named for the dialog's title. */
export interface ConcernTarget {
  assignmentId: string;
  traineeName: string;
}

const MIN_DESCRIPTION_LENGTH = 10;

/**
 * Raising a concern about one trainee, from wherever the button sits — the
 * roster or a placement thread's header. The server decides whether this
 * supervisor may raise one for that placement; this only collects the form.
 */
export function useRaiseConcern() {
  const { showSuccess, showError } = useSnackbar();
  const [raiseConcern, { isLoading: isSubmitting }] = useRaiseConcernMutation();

  const [target, setTarget] = useState<ConcernTarget | null>(null);
  const [category, setCategory] = useState<ConcernCategory>("CONDUCT");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const open = (next: ConcernTarget) => {
    setTarget(next);
    setCategory("CONDUCT");
    setDescription("");
    setError("");
  };

  const close = () => {
    setTarget(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    const text = description.trim();
    if (text.length < MIN_DESCRIPTION_LENGTH) {
      setError(
        `Describe the concern in at least ${MIN_DESCRIPTION_LENGTH} characters, so the coordinator has something to act on.`,
      );
      return;
    }
    setError("");
    try {
      await raiseConcern({
        assignmentId: target.assignmentId,
        category,
        description: text,
      }).unwrap();
      showSuccess("Concern sent to the coordinator.");
      setTarget(null);
    } catch (err: unknown) {
      const message = readError(err, "Failed to raise the concern.");
      setError(message);
      showError(message);
    }
  };

  return {
    target,
    category,
    setCategory,
    description,
    setDescription,
    error,
    isSubmitting,
    open,
    close,
    handleSubmit,
  };
}

export function readError(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string | string[] } })?.data;
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message ?? fallback;
}
