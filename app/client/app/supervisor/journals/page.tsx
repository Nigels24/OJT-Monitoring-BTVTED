"use client";

import Sidebar from "@/components/layout/Sidebar";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import SelectField from "@/components/ui/SelectField";
import TextField from "@/components/ui/TextField";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import { Eye, Images, NotebookText } from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { SUPERVISOR_NAV } from "@/features/supervisor/nav";
import { useSupervisorJournals } from "@/features/journal/hooks/use-supervisor-journals";
import JournalDetailDialog from "@/features/journal/components/JournalDetailDialog";
import {
  JOURNAL_STATUS_LABEL,
  JOURNAL_STATUS_VARIANT,
} from "@/features/journal/components/journal-status";
import type { SupervisorJournalRow } from "@/lib/api/journalApi";
import { formatDateOnly, formatWeekdayOnly } from "@/lib/format";

/**
 * Read-only: the trainees' journals for this establishment. Reviewing belongs to
 * the coordinator, so there are no actions here beyond opening an entry.
 */
export default function SupervisorJournalsPage() {
  const currentUser = useCurrentUser();
  const journals = useSupervisorJournals();

  const columns: DataTableColumn<SupervisorJournalRow>[] = [
    {
      key: "student",
      label: "Trainee",
      render: (r) => (
        <div>
          <div className="font-semibold text-gray-900">{r.student.name}</div>
          <div className="text-xs text-gray-500">
            {r.student.studentIdNumber}
          </div>
        </div>
      ),
    },
    {
      key: "entryDate",
      label: "Duty day",
      render: (r) => (
        <div>
          <div className="font-medium text-gray-900">
            {formatDateOnly(r.entryDate)}
          </div>
          <div className="text-xs text-gray-500">
            {formatWeekdayOnly(r.entryDate)}
          </div>
        </div>
      ),
    },
    {
      key: "excerpt",
      label: "Activities",
      render: (r) => (
        <p className="max-w-md text-gray-700 line-clamp-2">{r.excerpt}</p>
      ),
    },
    {
      key: "photos",
      label: "Photos",
      render: (r) => (
        <span className="inline-flex items-center gap-1 text-xs text-gray-600">
          <Images size={14} className="text-gray-400" />
          {r.photoCount}
        </span>
      ),
    },
    {
      key: "status",
      label: "Coordinator",
      render: (r) => (
        <StatusBadge
          label={JOURNAL_STATUS_LABEL[r.status]}
          variant={JOURNAL_STATUS_VARIANT[r.status]}
        />
      ),
    },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <button
          onClick={() => journals.openDetail(r)}
          className="px-2 py-1.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1 text-xs font-medium"
          aria-label={`Read ${r.student.name}'s entry for ${formatDateOnly(r.entryDate)}`}
        >
          <Eye size={14} />
          Read
        </button>
      ),
    },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        orgName="WPH Institute"
        orgSubtitle="Supervisor Portal"
        items={SUPERVISOR_NAV}
        userName={currentUser?.name || "Supervisor"}
      />

      <main className="flex-1 p-4 md:p-6">
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-2xl p-4 md:p-6 mb-6">
          <PageHeader
            title="Trainee Journals"
            subtitle="Read what your trainees wrote about their duty days"
            icon={NotebookText}
          />
        </div>

        <Card>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
            <div className="sm:w-72">
              <SelectField
                value={journals.studentId}
                onChange={journals.setStudentId}
                placeholder="All trainees"
                options={journals.studentOptions}
                className="w-full"
              />
            </div>
            <TextField
              label="Duty day from"
              type="date"
              value={journals.from}
              max={journals.to || undefined}
              onChange={(e) => journals.setFrom(e.target.value)}
              className="sm:w-44"
            />
            <TextField
              label="to"
              type="date"
              value={journals.to}
              min={journals.from || undefined}
              onChange={(e) => journals.setTo(e.target.value)}
              className="sm:w-44"
            />
          </div>

          {journals.isLoading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : journals.isError ? (
            <p className="text-red-600 text-sm py-8 text-center">
              Couldn&apos;t load journals. Please refresh to try again.
            </p>
          ) : journals.rows.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">
              No journal entries yet for your trainees.
            </p>
          ) : (
            <DataTable
              title=""
              icon={NotebookText}
              columns={columns}
              data={journals.rows}
              keyField="id"
            />
          )}
        </Card>
      </main>

      <JournalDetailDialog
        entry={journals.detail}
        isLoading={journals.isDetailOpen && !journals.detail}
        onClose={journals.closeDetail}
      />
    </div>
  );
}
