import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Globe,
  Images,
  NotebookPen,
  Users,
} from "lucide-react";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import SelectField from "@/components/ui/SelectField";
import TextField from "@/components/ui/TextField";
import type { JournalListRow, JournalStatus } from "@/lib/api/journalApi";
import { formatDateOnly } from "@/lib/format";
import {
  JOURNAL_STATUS_FILTER_OPTIONS,
  JOURNAL_STATUS_LABEL,
  JOURNAL_STATUS_VARIANT,
} from "./journal-status";

interface JournalReviewTableProps {
  rows: JournalListRow[];
  isLoading: boolean;
  isError: boolean;
  scope: "block" | "all";
  statusFilter: JournalStatus | "";
  from: string;
  to: string;
  page: number;
  totalPages: number;
  noBlocksAssigned: boolean;
  onScopeChange: (scope: "block" | "all") => void;
  onStatusFilterChange: (value: JournalStatus | "") => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onOpen: (row: JournalListRow) => void;
}

export default function JournalReviewTable({
  rows,
  isLoading,
  isError,
  scope,
  statusFilter,
  from,
  to,
  page,
  totalPages,
  noBlocksAssigned,
  onScopeChange,
  onStatusFilterChange,
  onFromChange,
  onToChange,
  onPageChange,
  onOpen,
}: JournalReviewTableProps) {
  const columns: DataTableColumn<JournalListRow>[] = [
    {
      key: "student",
      label: "Student",
      render: (r) => (
        <div>
          <div className="font-semibold text-gray-900">{r.student.name}</div>
          <div className="text-xs text-gray-500">
            {r.student.studentIdNumber}
            {r.block ? ` · ${r.block.name}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "establishment",
      label: "Establishment",
      render: (r) => r.establishment.name,
    },
    {
      key: "entryDate",
      label: "Duty day",
      render: (r) => (
        <div>
          <div className="font-medium text-gray-900">
            {formatDateOnly(r.entryDate)}
          </div>
          <div className="text-xs text-gray-500 max-w-xs truncate">
            {r.excerpt}
          </div>
        </div>
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
          {r.status === "RETURNED" && r.coordinatorRemarks && (
            <p className="text-xs text-red-600 mt-1 max-w-xs">
              <span className="font-medium">Returned:</span>{" "}
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
        <button
          onClick={() => onOpen(r)}
          className="px-2 py-1.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1 text-xs font-medium"
          aria-label={`Review ${r.student.name}'s entry for ${formatDateOnly(r.entryDate)}`}
        >
          <Eye size={14} />
          Review
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-end gap-3 mb-4">
        {/* My Block / All Program — the same toggle as the student roster. */}
        <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1 self-start">
          <button
            type="button"
            onClick={() => onScopeChange("block")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              scope === "block"
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Users size={14} />
            My Block
          </button>
          <button
            type="button"
            onClick={() => onScopeChange("all")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              scope === "all"
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Globe size={14} />
            All Program
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="sm:w-48">
            <SelectField
              value={statusFilter}
              onChange={(value) =>
                onStatusFilterChange(value as JournalStatus | "")
              }
              placeholder="Submitted"
              options={JOURNAL_STATUS_FILTER_OPTIONS}
              className="w-full"
            />
          </div>
          <TextField
            label="Duty day from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => onFromChange(e.target.value)}
            className="sm:w-44"
          />
          <TextField
            label="to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => onToChange(e.target.value)}
            className="sm:w-44"
          />
        </div>
      </div>

      {noBlocksAssigned && scope === "block" && (
        <p className="text-xs text-amber-600 mb-3">
          You have no blocks assigned yet, so this is showing every journal entry
          in the program.
        </p>
      )}

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : isError ? (
        <p className="text-red-600 text-sm py-8 text-center">
          Couldn&apos;t load journal entries. Please refresh to try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">
          {statusFilter === "SUBMITTED"
            ? "Nothing waiting for review. You're all caught up."
            : "No journal entries match your filters."}
        </p>
      ) : (
        <>
          <DataTable
            title=""
            icon={NotebookPen}
            columns={columns}
            data={rows}
            keyField="id"
          />

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                disabled={page === 1}
                onClick={() => onPageChange(Math.max(1, page - 1))}
                className="p-2 rounded-md border border-gray-300 text-gray-500 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                className="p-2 rounded-md border border-gray-300 text-gray-500 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
