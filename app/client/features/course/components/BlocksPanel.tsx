import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import SelectField from "@/components/ui/SelectField";
import {
  Block,
  CoordinatorSummary,
  useCreateBlockMutation,
  useUpdateBlockMutation,
  useDeleteBlockMutation,
} from "@/lib/api/courseApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";

interface BlocksPanelProps {
  courseId: string;
  blocks: Block[];
  coordinators: CoordinatorSummary[];
}

const EMPTY_ROW = {
  name: "",
  yearLevel: "",
  academicYear: "2025-2026",
  coordinatorId: "",
};

/**
 * A course's blocks — one cohort per year level per academic year, each
 * with its own coordinator (Table 1: "two blocks per year level, each with
 * its own coordinator"). Inline add/edit rows, same shape as
 * `RequirementsPanel`.
 */
export default function BlocksPanel({
  courseId,
  blocks,
  coordinators,
}: BlocksPanelProps) {
  const { showSuccess, showError } = useSnackbar();
  const [createBlock, { isLoading: isCreating }] = useCreateBlockMutation();
  const [updateBlock, { isLoading: isUpdating }] = useUpdateBlockMutation();
  const [deleteBlock] = useDeleteBlockMutation();

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [row, setRow] = useState(EMPTY_ROW);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Block | null>(null);

  const startAdd = () => {
    setAdding(true);
    setEditingId(null);
    setRow(EMPTY_ROW);
    setError("");
  };
  const startEdit = (block: Block) => {
    setEditingId(block.id);
    setAdding(false);
    setRow({
      name: block.name,
      yearLevel: String(block.yearLevel),
      academicYear: block.academicYear,
      coordinatorId: block.coordinatorId ?? "",
    });
    setError("");
  };
  const cancel = () => {
    setAdding(false);
    setEditingId(null);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    const yearLevel = Number(row.yearLevel);
    if (!row.name.trim()) {
      setError("Block name is required.");
      return;
    }
    if (!yearLevel || yearLevel < 1) {
      setError("Year level must be a positive number.");
      return;
    }
    if (!/^\d{4}-\d{4}$/.test(row.academicYear)) {
      setError('Academic year must look like "2025-2026".');
      return;
    }
    try {
      if (editingId) {
        await updateBlock({
          id: editingId,
          name: row.name,
          yearLevel,
          academicYear: row.academicYear,
          coordinatorId: row.coordinatorId || null,
        }).unwrap();
        showSuccess("Block updated.");
      } else {
        await createBlock({
          courseId,
          name: row.name,
          yearLevel,
          academicYear: row.academicYear,
          coordinatorId: row.coordinatorId || undefined,
        }).unwrap();
        showSuccess("Block added.");
      }
      cancel();
    } catch (err: unknown) {
      setError(readError(err, "Failed to save block."));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBlock(deleteTarget.id).unwrap();
      showSuccess("Block deleted.");
      setDeleteTarget(null);
    } catch (err: unknown) {
      showError(readError(err, "Failed to delete block."));
    }
  };

  const sorted = blocks
    .slice()
    .sort((a, b) => b.academicYear.localeCompare(a.academicYear) || a.name.localeCompare(b.name));

  const coordinatorOptions = [
    { label: "Unassigned", value: "" },
    ...coordinators.map((c) => ({ label: c.user.name, value: c.id })),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-800 text-sm">Blocks</h4>
        <button
          type="button"
          onClick={startAdd}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50"
        >
          <Plus size={14} /> Add Block
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left font-medium text-gray-500 pb-2 text-xs">Name</th>
              <th className="text-left font-medium text-gray-500 pb-2 text-xs">Year</th>
              <th className="text-left font-medium text-gray-500 pb-2 text-xs">
                Academic Year
              </th>
              <th className="text-left font-medium text-gray-500 pb-2 text-xs">
                Coordinator
              </th>
              <th className="text-left font-medium text-gray-500 pb-2 text-xs">
                Students
              </th>
              <th className="text-right font-medium text-gray-500 pb-2 text-xs">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((block) =>
              editingId === block.id ? (
                <RowForm
                  key={block.id}
                  row={row}
                  setRow={setRow}
                  coordinatorOptions={coordinatorOptions}
                  onSave={handleSave}
                  onCancel={cancel}
                  loading={isUpdating}
                />
              ) : (
                <tr key={block.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-gray-700 whitespace-nowrap">{block.name}</td>
                  <td className="py-2 text-gray-700">Year {block.yearLevel}</td>
                  <td className="py-2 text-gray-700">{block.academicYear}</td>
                  <td className="py-2 text-gray-700">
                    {block.coordinator?.user.name ?? (
                      <span className="text-gray-400 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="py-2 text-gray-700">
                    {block._count?.students ?? 0}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => startEdit(block)}
                        className="p-1 rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50"
                        aria-label={`Edit ${block.name}`}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(block)}
                        className="p-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                        aria-label={`Delete ${block.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            {adding && (
              <RowForm
                row={row}
                setRow={setRow}
                coordinatorOptions={coordinatorOptions}
                onSave={handleSave}
                onCancel={cancel}
                loading={isCreating}
              />
            )}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && !adding && (
        <p className="text-xs text-gray-400 italic py-2">
          No blocks yet — add one per cohort/year level/academic year.
        </p>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Block?"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.name}" (Year ${deleteTarget.yearLevel}, ${deleteTarget.academicYear})? This cannot be undone.`
            : ""
        }
        confirmLabel="Yes, delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function RowForm({
  row,
  setRow,
  coordinatorOptions,
  onSave,
  onCancel,
  loading,
}: {
  row: typeof EMPTY_ROW;
  setRow: (row: typeof EMPTY_ROW) => void;
  coordinatorOptions: { label: string; value: string }[];
  onSave: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <tr className="border-b border-gray-50 last:border-0 bg-blue-50/40">
      <td className="py-2 pr-2">
        <input
          value={row.name}
          onChange={(e) => setRow({ ...row, name: e.target.value })}
          placeholder="Block A"
          className="w-28 h-8 px-2 border border-gray-300 rounded-md text-sm"
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          min={1}
          value={row.yearLevel}
          onChange={(e) => setRow({ ...row, yearLevel: e.target.value })}
          placeholder="Year"
          className="w-16 h-8 px-2 border border-gray-300 rounded-md text-sm"
        />
      </td>
      <td className="py-2 pr-2">
        <input
          value={row.academicYear}
          onChange={(e) => setRow({ ...row, academicYear: e.target.value })}
          placeholder="2025-2026"
          className="w-28 h-8 px-2 border border-gray-300 rounded-md text-sm"
        />
      </td>
      <td className="py-2 pr-2">
        <SelectField
          value={row.coordinatorId}
          onChange={(value) => setRow({ ...row, coordinatorId: value })}
          options={coordinatorOptions}
          className="w-40"
        />
      </td>
      <td className="py-2" />
      <td className="py-2 text-right">
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onSave}
            disabled={loading}
            className="p-1 rounded-md border border-green-200 text-green-600 hover:bg-green-50 disabled:opacity-50"
            aria-label="Save"
          >
            <Check size={12} />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
            aria-label="Cancel"
          >
            <X size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function readError(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string | string[] } })?.data;
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message ?? fallback;
}
