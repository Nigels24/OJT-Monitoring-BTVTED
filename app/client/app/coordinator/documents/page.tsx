"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { COORDINATOR_NAV } from "@/features/coordinator/nav";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import {
  FileText,
  Hourglass,
  ListChecks,
  ClipboardCheck,
  Grid3x3,
} from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useDocumentsReview } from "@/features/document/hooks/use-documents-review";
import { useRequirementStatus } from "@/features/document/hooks/use-requirement-status";
import DocumentsReviewTable from "@/features/document/components/DocumentsReviewTable";
import RejectDialog from "@/features/document/components/RejectDialog";
import RequirementStatusMatrix from "@/features/document/components/RequirementStatusMatrix";
import RequirementCellDialog from "@/features/document/components/RequirementCellDialog";

type Tab = "queue" | "status";

/**
 * Two views of the same table: the review queue (clear what's waiting) and the
 * Table 3 requirements matrix (see who is missing what across a block, without
 * opening each student).
 *
 * Tabs rather than two sidebar entries — both are "documents", and the queue is
 * still the landing view.
 */
export default function CoordinatorDocumentsPage() {
  const currentUser = useCurrentUser();
  const [tab, setTab] = useState<Tab>("queue");
  const review = useDocumentsReview();
  const status = useRequirementStatus();

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50">
      <Sidebar
        items={COORDINATOR_NAV}
        userName={currentUser?.name || "Coordinator"}
      />

      <main className="flex-1 min-w-0 p-4 md:p-6">
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-2xl p-4 md:p-6 mb-6">
          <PageHeader
            title="Documents"
            subtitle="Review uploaded requirements and track what each trainee still owes"
            icon={FileText}
          />
        </div>

        <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1 mb-4">
          <button
            type="button"
            onClick={() => setTab("queue")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "queue"
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <ClipboardCheck size={14} />
            Review Queue
          </button>
          <button
            type="button"
            onClick={() => setTab("status")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "status"
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Grid3x3 size={14} />
            Requirements Status
          </button>
        </div>

        {tab === "queue" ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <StatCard
                label="Awaiting Review"
                value={review.isError ? "—" : review.pendingCount}
                icon={Hourglass}
                variant="accent"
              />
              <StatCard
                label="Records Shown"
                value={review.isError ? "—" : review.filtered.length}
                icon={ListChecks}
              />
            </div>

            <Card>
              <DocumentsReviewTable
                rows={review.paged}
                isLoading={review.isLoading}
                isError={review.isError}
                search={review.search}
                statusFilter={review.statusFilter}
                page={review.page}
                totalPages={review.totalPages}
                actioningId={review.actioningId}
                onSearchChange={review.setSearch}
                onStatusFilterChange={review.setStatusFilter}
                onPageChange={review.setPage}
                onApprove={review.handleApprove}
                onReject={review.openReject}
              />
            </Card>
          </>
        ) : (
          <Card>
            <h2 className="text-base md:text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Grid3x3 size={18} className="text-blue-600" />
              Requirements Status
            </h2>
            <RequirementStatusMatrix
              requirements={status.requirements}
              stages={status.stages}
              rows={status.rows}
              isLoading={status.isLoading}
              isError={status.isError}
              scope={status.scope}
              stage={status.stage}
              noBlocksAssigned={status.noBlocksAssigned}
              onScopeChange={status.setScope}
              onStageChange={status.setStage}
              onCellClick={status.openCell}
            />
          </Card>
        )}
      </main>

      <RejectDialog
        target={review.rejectTarget}
        reason={review.rejectReason}
        error={review.rejectError}
        isSubmitting={review.isRejecting}
        onReasonChange={review.setRejectReason}
        onConfirm={review.handleRejectConfirm}
        onCancel={review.closeReject}
      />

      <RequirementCellDialog
        selected={status.selected}
        requirementName={
          status.selected
            ? status.requirementName(status.selected.cell.requirementId)
            : ""
        }
        file={status.file}
        reviewNote={status.reviewNote}
        error={status.error}
        isUploading={status.isUploading}
        isReviewing={status.isReviewing}
        onReviewNoteChange={status.setReviewNote}
        onFileChange={status.handleFileChange}
        onUpload={status.handleUpload}
        onApprove={status.approve}
        onReject={status.reject}
        onClose={status.closeCell}
      />
    </div>
  );
}
