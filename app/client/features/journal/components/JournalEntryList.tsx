import { Eye, Images, NotebookPen, PencilLine, Trash2 } from "lucide-react";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import SelectField from "@/components/ui/SelectField";
import type { JournalStatus, StudentJournalEntry } from "@/lib/api/journalApi";
import { formatDateOnly, formatWeekdayOnly } from "@/lib/format";
import {
  JOURNAL_STATUS_FILTER_OPTIONS,
  JOURNAL_STATUS_LABEL,
  JOURNAL_STATUS_VARIANT,
} from "./journal-status";

interface JournalEntryListProps {
  rows: StudentJournalEntry[];
  isLoading: boolean;
  isError: boolean;
  statusFilter: JournalStatus | "";
  onStatusFilterChange: (value: JournalStatus | "") => void;
  onView: (entry: StudentJournalEntry) => void;
  onEdit: (entry: StudentJournalEntry) => void;
  onDelete: (entry: StudentJournalEntry) => void;
}

export default function JournalEntryList({
  rows,
  isLoading,
  isError,
  statusFilter,
  onStatusFilterChange,
  onView,
  onEdit,
  onDelete,
}: JournalEntryListProps) {
  const columns: DataTableColumn<StudentJournalEntry>[] = [
    {
      key: "entryDate",
      label: "Duty day",
      render: (r) => (
        <div>
          <div className="font-semibold text-gray-900">
            {formatDateOnly(r.entryDate)}
          </div>
          <div className="text-xs text-gray-500">
            {formatWeekdayOnly(r.entryDate)}
          </div>
        </div>
      ),
    },
    {
      key: "activities",
      label: "Activities",
      render: (r) => (
        <p className="max-w-md text-gray-700 line-clamp-2">{r.activities}</p>
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
      label: "Status",
      render: (r) => (
        <div>
          <StatusBadge
            label={JOURNAL_STATUS_LABEL[r.status]}
            variant={JOURNAL_STATUS_VARIANT[r.status]}
          />
          {/* Remarks stay visible after a resubmission until it is reviewed
              again, so the student can keep checking what was asked for. */}
          {r.coordinatorRemarks && (
            <p className="text-xs text-red-600 mt-1 max-w-xs">
              <span className="font-medium">Coordinator:</span>{" "}
              {r.coordinatorRemarks}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (r) => (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onView(r)}
            className="px-2 py-1.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1 text-xs font-medium"
            aria-label={`View entry for ${formatDateOnly(r.entryDate)}`}
          >
            <Eye size={14} />
            View
          </button>
          {r.canEdit && (
            <button
              onClick={() => onEdit(r)}
              className="px-2 py-1.5 rounded-md border border-amber-200 text-amber-700 hover:bg-amber-50 inline-flex items-center gap-1 text-xs font-medium"
              aria-label={`Edit entry for ${formatDateOnly(r.entryDate)}`}
            >
              <PencilLine size={14} />
              Edit
            </button>
          )}
          {r.canDelete && (
            <button
              onClick={() => onDelete(r)}
              className="px-2 py-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center gap-1 text-xs font-medium"
              aria-label={`Delete entry for ${formatDateOnly(r.entryDate)}`}
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="md:w-52 mb-4">
        <SelectField
          value={statusFilter}
          onChange={(value) => onStatusFilterChange(value as JournalStatus | "")}
          placeholder="All Statuses"
          options={JOURNAL_STATUS_FILTER_OPTIONS}
          className="w-full"
        />
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : isError ? (
        <p className="text-red-600 text-sm py-8 text-center">
          Couldn&apos;t load your journal. Please refresh to try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">
          {statusFilter
            ? "No entries match that status."
            : "You haven't written any journal entries yet."}
        </p>
      ) : (
        <DataTable
          title=""
          icon={NotebookPen}
          columns={columns}
          data={rows}
          keyField="id"
        />
      )}
    </div>
  );
}
