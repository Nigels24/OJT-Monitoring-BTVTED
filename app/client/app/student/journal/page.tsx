"use client";

import Sidebar from "@/components/layout/Sidebar";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  NotebookPen,
  PencilLine,
  CheckCircle2,
  Undo2,
  Trash2,
} from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { STUDENT_NAV } from "@/features/student-portal/nav";
import { useStudentJournal } from "@/features/journal/hooks/use-student-journal";
import JournalEntryForm from "@/features/journal/components/JournalEntryForm";
import JournalEntryList from "@/features/journal/components/JournalEntryList";
import JournalDetailDialog from "@/features/journal/components/JournalDetailDialog";
import { formatDateOnly } from "@/lib/format";

export default function StudentJournalPage() {
  const currentUser = useCurrentUser();
  const journal = useStudentJournal();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        orgName="WPH Institute"
        orgSubtitle="OJT Monitoring"
        items={STUDENT_NAV}
        userName={currentUser?.name || "Student"}
      />

      <main className="flex-1 p-4 md:p-6">
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-2xl p-4 md:p-6 mb-6">
          <PageHeader
            title="Journal"
            subtitle="Write up each duty day, attach photos, and track your coordinator's review"
            icon={NotebookPen}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <StatCard
            label="Awaiting Review"
            value={journal.isError ? "—" : journal.summary.submitted}
            icon={PencilLine}
            variant="accent"
          />
          <StatCard
            label="Accepted"
            value={journal.isError ? "—" : journal.summary.accepted}
            icon={CheckCircle2}
            subtext={`of ${journal.summary.total} entries`}
          />
          <StatCard
            label="Returned"
            value={journal.isError ? "—" : journal.summary.returned}
            icon={Undo2}
            subtext="need your changes"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <Card className="xl:col-span-2 h-fit">
            <h2 className="text-base md:text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <PencilLine size={18} className="text-blue-600" />
              {journal.isEditing ? "Edit Entry" : "New Entry"}
            </h2>
            <JournalEntryForm
              form={journal.form}
              photos={journal.photos}
              photoSlotsLeft={journal.photoSlotsLeft}
              error={journal.error}
              dutyDayError={journal.dutyDayError}
              isSubmitting={journal.isSubmitting}
              isEditing={journal.isEditing}
              editDetail={journal.editDetail}
              isDetailLoading={journal.isDetailLoading}
              removePhotoIds={journal.removePhotoIds}
              minDate={journal.minDate}
              maxDate={journal.maxDate}
              disabled={journal.isDisabled}
              disabledMessage={journal.disabledMessage}
              dutyDaysLabel={journal.assignment?.dutyDaysLabel}
              setField={journal.setField}
              onPhotosChange={journal.handlePhotosChange}
              onRemovePickedPhoto={journal.removePickedPhoto}
              onToggleRemovePhoto={journal.toggleRemovePhoto}
              onSubmit={journal.handleSubmit}
              onCancelEdit={journal.cancelEdit}
            />
          </Card>

          <Card className="xl:col-span-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <h2 className="text-base md:text-lg font-semibold text-gray-800 flex items-center gap-2">
                <NotebookPen size={18} className="text-blue-600" />
                My Entries
              </h2>
              {journal.assignment && (
                <p className="text-xs text-gray-500">
                  {journal.assignment.establishment.name} ·{" "}
                  {journal.assignment.dutyDaysLabel}
                </p>
              )}
            </div>
            <JournalEntryList
              rows={journal.entries}
              isLoading={journal.isLoading}
              isError={journal.isError}
              statusFilter={journal.statusFilter}
              onStatusFilterChange={journal.setStatusFilter}
              onView={journal.openView}
              onEdit={journal.startEdit}
              onDelete={journal.openDelete}
            />
          </Card>
        </div>
      </main>

      <JournalDetailDialog
        entry={journal.viewDetail}
        isLoading={journal.isViewOpen && !journal.viewDetail}
        onClose={journal.closeView}
      />

      <ConfirmDialog
        open={!!journal.deleteTarget}
        title="Delete this journal entry?"
        message={
          journal.deleteTarget
            ? `Your entry for ${formatDateOnly(journal.deleteTarget.entryDate)} and its photos will be permanently removed. This can't be undone.`
            : ""
        }
        confirmLabel={journal.isDeleting ? "Deleting..." : "Yes, delete it"}
        icon={Trash2}
        variant="danger"
        onConfirm={journal.handleDeleteConfirm}
        onCancel={journal.closeDelete}
      />
    </div>
  );
}
