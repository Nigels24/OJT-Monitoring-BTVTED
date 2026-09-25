"use client";

import Sidebar from "@/components/layout/Sidebar";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import { NotebookPen, Hourglass, ListChecks } from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { COORDINATOR_NAV } from "@/features/coordinator/nav";
import { useJournalReview } from "@/features/journal/hooks/use-journal-review";
import JournalReviewTable from "@/features/journal/components/JournalReviewTable";
import JournalDetailDialog from "@/features/journal/components/JournalDetailDialog";

/**
 * The coordinator's journal review queue: read an entry with its photos, then
 * accept it or return it with written comments (which notify the student).
 */
export default function CoordinatorJournalsPage() {
  const currentUser = useCurrentUser();
  const review = useJournalReview();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        orgName="WPH Institute"
        orgSubtitle="Barangay San Francisco"
        items={COORDINATOR_NAV}
        userName={currentUser?.name || "Coordinator"}
      />

      <main className="flex-1 p-4 md:p-6">
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-2xl p-4 md:p-6 mb-6">
          <PageHeader
            title="Journal Review"
            subtitle="Read each duty day's write-up and photos, then accept or return it"
            icon={NotebookPen}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <StatCard
            label="Awaiting Review"
            value={review.isError ? "—" : review.awaitingReview}
            icon={Hourglass}
            variant="accent"
            subtext={review.scope === "block" ? "in your blocks" : "program-wide"}
          />
          <StatCard
            label="Entries Shown"
            value={review.isError ? "—" : review.total}
            icon={ListChecks}
            subtext="matching your filters"
          />
        </div>

        <Card>
          <JournalReviewTable
            rows={review.rows}
            isLoading={review.isLoading}
            isError={review.isError}
            scope={review.scope}
            statusFilter={review.statusFilter}
            from={review.from}
            to={review.to}
            page={review.page}
            totalPages={review.totalPages}
            noBlocksAssigned={review.noBlocksAssigned}
            onScopeChange={review.setScope}
            onStatusFilterChange={review.setStatusFilter}
            onFromChange={review.setFrom}
            onToChange={review.setTo}
            onPageChange={review.setPage}
            onOpen={review.openDetail}
          />
        </Card>
      </main>

      <JournalDetailDialog
        entry={review.detail}
        isLoading={review.isDetailOpen && !review.detail}
        onClose={review.closeDetail}
        review={{
          remarks: review.remarks,
          error: review.reviewError,
          isSubmitting: review.isReviewing,
          onRemarksChange: review.setRemarks,
          onAccept: review.accept,
          onReturn: review.returnEntry,
        }}
      />
    </div>
  );
}
