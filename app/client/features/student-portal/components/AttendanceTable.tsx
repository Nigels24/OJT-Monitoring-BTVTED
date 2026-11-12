import { ChevronLeft, ChevronRight, CalendarCheck, PencilLine } from "lucide-react";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";
import StatusBadge, { BadgeVariant } from "@/components/ui/StatusBadge";
import { AttendanceRecord, AttendanceStatus } from "@/lib/api/studentPortalApi";
import { formatDateOnly, formatWeekdayOnly } from "@/lib/format";
import AttendanceChangeNote from "@/components/ui/AttendanceChangeNote";

interface AttendanceTableProps {
  rows: AttendanceRecord[];
  isLoading: boolean;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
  /** Loads a PENDING/DECLINED row into the log form for correction. Omitted -> no action column. */
  onCorrect?: (record: AttendanceRecord) => void;
}

const STATUS_VARIANT: Record<AttendanceStatus, BadgeVariant> = {
  PENDING: "pending",
  APPROVED: "approved",
  DECLINED: "declined",
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DECLINED: "Declined",
};

/** `HH:mm` in the viewer's timezone, or an em dash when the slot is unused. */
function clock(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AttendanceTable({
  rows,
  isLoading,
  page,
  totalPages,
  onPageChange,
  emptyMessage = "No attendance logged yet.",
  onCorrect,
}: AttendanceTableProps) {
  // APPROVED hours must never change after the fact, so only PENDING and
  // DECLINED rows get a correction action.
  const correctAction = (r: AttendanceRecord) =>
    onCorrect && r.status !== "APPROVED" ? (
      <button
        type="button"
        onClick={() => onCorrect(r)}
        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap"
      >
        <PencilLine size={13} />
        Correct this log
      </button>
    ) : null;

  const statusBadge = (r: AttendanceRecord) => (
    <StatusBadge
      label={STATUS_LABEL[r.status]}
      variant={STATUS_VARIANT[r.status]}
    />
  );

  /** A declined log is only actionable if the student can see why, and a
   *  resubmitted one still shows why it was declined before. */
  const remarks = (r: AttendanceRecord) => (
    <>
      <span className="text-gray-600">{r.remarks || "—"}</span>
      <AttendanceChangeNote {...r} />
    </>
  );

  // Four compact columns rather than seven: the history sits in three fifths
  // of the page beside the log form, and seven pushed the date and the
  // correction action out of view at laptop width. The weekday goes under the
  // date, the two sessions share a cell, and the action sits with the status.
  const columns: DataTableColumn<AttendanceRecord>[] = [
    {
      key: "date",
      label: "Date",
      render: (r) => (
        <div className="whitespace-nowrap">
          <div className="font-medium text-gray-900">
            {formatDateOnly(r.date)}
          </div>
          <div className="text-xs text-gray-500">
            {formatWeekdayOnly(r.date)}
          </div>
        </div>
      ),
    },
    {
      key: "time",
      label: "Time in — out",
      render: (r) => (
        <div className="whitespace-nowrap tabular-nums">
          <div>
            <span className="text-gray-500">AM</span> {clock(r.timeInAM)} —{" "}
            {clock(r.timeOutAM)}
          </div>
          <div>
            <span className="text-gray-500">PM</span> {clock(r.timeInPM)} —{" "}
            {clock(r.timeOutPM)}
          </div>
        </div>
      ),
    },
    // No "Total Hours" column — removed at the client's request. Hours are
    // still tracked and shown as the running totals on the dashboard, which is
    // what tells the student how far through their requirement they are.
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <div className="flex flex-col items-start gap-1.5">
          {statusBadge(r)}
          {correctAction(r)}
        </div>
      ),
    },
    {
      key: "remarks",
      label: "Remarks",
      render: (r) => <div className="min-w-[10rem] max-w-xs">{remarks(r)}</div>,
    },
  ];

  if (isLoading) {
    return <p className="text-gray-400 text-sm">Loading...</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="text-gray-500 text-sm py-8 text-center">{emptyMessage}</p>
    );
  }

  return (
    <>
      <div className="hidden sm:block">
        <DataTable
          title=""
          icon={CalendarCheck}
          columns={columns}
          data={rows}
          keyField="id"
        />
      </div>

      {/* Phones: one card per log, nothing to scroll sideways. */}
      <ul className="sm:hidden divide-y divide-gray-100">
        {rows.map((r) => (
          <li key={r.id} className="py-3 text-sm text-gray-700">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-gray-900">
                  {formatDateOnly(r.date)}
                </div>
                <div className="text-xs text-gray-500">
                  {formatWeekdayOnly(r.date)}
                </div>
              </div>
              {statusBadge(r)}
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
              <dt className="text-gray-500">AM</dt>
              <dd>
                {clock(r.timeInAM)} — {clock(r.timeOutAM)}
              </dd>
              <dt className="text-gray-500">PM</dt>
              <dd>
                {clock(r.timeInPM)} — {clock(r.timeOutPM)}
              </dd>
            </dl>
            <div className="mt-2">{remarks(r)}</div>
            {correctAction(r) && <div className="mt-2">{correctAction(r)}</div>}
          </li>
        ))}
      </ul>

      {onPageChange && totalPages && totalPages > 1 && page && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            disabled={page === 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="p-2 rounded-md border border-gray-300 text-gray-500 disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => onPageChange(n)}
              className={`w-9 h-9 rounded-md text-sm font-medium ${
                n === page
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {n}
            </button>
          ))}
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
  );
}
