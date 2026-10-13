import { CheckCircle2, Circle } from "lucide-react";
import type { CompletionChecklist as Checklist } from "@/lib/api/reportApi";

export const COMPLETION_ITEMS: { key: keyof Checklist; label: string }[] = [
  { key: "hoursMet", label: "Approved hours reach the required hours" },
  { key: "portfolioAccepted", label: "Portfolio accepted" },
  { key: "evaluationRecorded", label: "Supervisor evaluation submitted" },
  { key: "gradeRecorded", label: "Coordinator grade recorded" },
];

interface CompletionChecklistProps {
  checklist: Checklist;
  /** The placement's own status — a cancelled one is not "in progress". */
  status: string;
  className?: string;
}

/**
 * What a placement still needs before it is complete.
 *
 * Display only: the four conditions are evaluated by the server
 * (`common/assignment-completion.ts`), which also marks the placement
 * Completed by itself the moment the last one is met.
 */
export default function CompletionChecklist({
  checklist,
  status,
  className = "",
}: CompletionChecklistProps) {
  const done = COMPLETION_ITEMS.filter((item) => checklist[item.key]).length;
  const summary =
    status === "COMPLETED"
      ? "Training completed"
      : status === "ACTIVE"
        ? checklist.complete
          ? "All requirements met"
          : `${done} of ${COMPLETION_ITEMS.length} requirements met`
        : `Placement ${status.toLowerCase()} — ${done} of ${COMPLETION_ITEMS.length} requirements were met`;

  return (
    <div className={className}>
      <p className="text-xs font-semibold text-gray-700 mb-1.5">
        Completion checklist · <span className="font-normal">{summary}</span>
      </p>
      <ul className="space-y-1">
        {COMPLETION_ITEMS.map((item) => (
          <li
            key={item.key}
            className="flex items-center gap-2 text-xs text-gray-700"
          >
            {checklist[item.key] ? (
              <CheckCircle2
                size={14}
                className="shrink-0 text-green-600"
                aria-hidden="true"
              />
            ) : (
              <Circle
                size={14}
                className="shrink-0 text-gray-400"
                aria-hidden="true"
              />
            )}
            <span>
              {item.label}
              <span className="sr-only">
                {checklist[item.key] ? " — met" : " — not yet met"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
