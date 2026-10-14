"use client";

import Sidebar from "@/components/layout/Sidebar";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import SelectField from "@/components/ui/SelectField";
import { Globe, MessageSquare, TriangleAlert, Users } from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { COORDINATOR_NAV } from "@/features/coordinator/nav";
import { ConcernStatus } from "@/lib/api/concernApi";
import { useConcernReview } from "@/features/concerns/hooks/use-concern-review";
import ConcernCard from "@/features/concerns/components/ConcernCard";
import ConcernRespondDialog from "@/features/concerns/components/ConcernRespondDialog";

const STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Open", value: "OPEN" },
  { label: "Acknowledged", value: "ACKNOWLEDGED" },
  { label: "Resolved", value: "RESOLVED" },
];

/**
 * Concerns supervisors have raised about trainees. The coordinator reads each
 * one and acknowledges or resolves it; the supervisor who raised it is
 * notified. Concerns are records on the placement — kept permanently, never
 * shown to the trainee.
 */
export default function CoordinatorConcernsPage() {
  const currentUser = useCurrentUser();
  const review = useConcernReview();

  const scopeButton = (
    scope: "block" | "all",
    label: string,
    Icon: typeof Users,
  ) => (
    <button
      type="button"
      onClick={() => {
        review.setScope(scope);
      }}
      aria-pressed={review.scope === scope}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        review.scope === scope
          ? "bg-blue-600 text-white"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50">
      <Sidebar
        items={COORDINATOR_NAV}
        userName={currentUser?.name || "Coordinator"}
      />

      <main className="flex-1 min-w-0 p-4 md:p-6">
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-2xl p-4 md:p-6 mb-6">
          <PageHeader
            title="Concerns"
            subtitle="Concerns supervisors have raised about a trainee's conduct or performance"
            icon={TriangleAlert}
          />
        </div>

        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1 w-fit">
              {scopeButton("block", "My Block", Users)}
              {scopeButton("all", "All Program", Globe)}
            </div>
            <div className="sm:w-52">
              <SelectField
                value={review.statusFilter}
                onChange={(value) => {
                  review.setStatusFilter(value as ConcernStatus | "");
                }}
                options={STATUS_OPTIONS}
                className="w-full"
              />
            </div>
          </div>

          {review.noBlocksAssigned && review.scope === "block" && (
            <p className="text-xs text-amber-600 mb-3">
              You have no blocks assigned yet, so every concern in the program
              is shown.
            </p>
          )}

          {review.isError ? (
            <p role="alert" className="text-sm text-red-600 py-8 text-center">
              Could not load concerns.
            </p>
          ) : review.isLoading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : review.concerns.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              No concerns match these filters.
            </p>
          ) : (
            <ul className="space-y-3">
              {review.concerns.map((concern) => (
                <ConcernCard
                  key={concern.id}
                  concern={concern}
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        review.openRespond(concern);
                      }}
                      className="px-3 py-1.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1.5 text-xs font-medium"
                    >
                      <MessageSquare size={14} />
                      {concern.status === "OPEN"
                        ? "Respond"
                        : "Update response"}
                    </button>
                  }
                />
              ))}
            </ul>
          )}
        </Card>
      </main>

      <ConcernRespondDialog
        concern={review.target}
        response={review.response}
        error={review.error}
        isSubmitting={review.isResponding}
        onResponseChange={review.setResponse}
        onAcknowledge={review.acknowledge}
        onResolve={review.resolve}
        onClose={review.closeRespond}
      />
    </div>
  );
}
