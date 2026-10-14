import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  CourseRequirement,
  useCreateRequirementMutation,
  useUpdateRequirementMutation,
  useDeleteRequirementMutation,
} from "@/lib/api/courseApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";

interface RequirementsPanelProps {
  courseId: string;
  requirements: CourseRequirement[];
}

const EMPTY_ROW = { yearLevel: "", requiredHours: "" };

/**
 * Per-year-level OJT hour requirements for one course (thesis: "a program can
 * require OJT at more than one year level"). Add/edit are inline rows rather
 * than a separate dialog — there are only two fields, and this stays inside
 * `CourseDetailDialog`'s already-scrolling panel.
 */
export default function RequirementsPanel({
  courseId,
  requirements,
}: RequirementsPanelProps) {
  const { showSuccess, showError } = useSnackbar();
  const [createRequirement, { isLoading: isCreating }] =
    useCreateRequirementMutation();
  const [updateRequirement, { isLoading: isUpdating }] =
    useUpdateRequirementMutation();
  const [deleteRequirement] = useDeleteRequirementMutation();

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [row, setRow] = useState(EMPTY_ROW);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CourseRequirement | null>(
    null,
  );

  const startAdd = () => {
    setAdding(true);
    setEditingId(null);
    setRow(EMPTY_ROW);
    setError("");
  };
  const startEdit = (req: CourseRequirement) => {
    setEditingId(req.id);
    setAdding(false);
    setRow({
      yearLevel: String(req.yearLevel),
      requiredHours: String(req.requiredHours),
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
    const requiredHours = Number(row.requiredHours);
    if (!yearLevel || yearLevel < 1) {
      setError("Year level must be a positive number.");
      return;
    }
    if (!Number.isFinite(requiredHours) || requiredHours < 0) {
      setError("Required hours must be a non-negative number.");
      return;
    }
    try {
      if (editingId) {
        await updateRequirement({ id: editingId, yearLevel, requiredHours }).unwrap();
        showSuccess("Requirement updated.");
      } else {
        await createRequirement({ courseId, yearLevel, requiredHours }).unwrap();
        showSuccess("Requirement added.");
      }
      cancel();
    } catch (err: unknown) {
      setError(readError(err, "Failed to save requirement."));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteRequirement(deleteTarget.id).unwrap();
      showSuccess("Requirement deleted.");
      setDeleteTarget(null);
    } catch (err: unknown) {
      showError(readError(err, "Failed to delete requirement."));
    }
  };

  const sorted = requirements.slice().sort((a, b) => a.yearLevel - b.yearLevel);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-800 text-sm">
          Requirements by Year Level
        </h4>
        <button
          type="button"
          onClick={startAdd}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50"
        >
          <Plus size={14} /> Add Requirement
        </button>
      </div>

      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left font-medium text-gray-500 pb-2 text-xs">
              Year Level
            </th>
            <th className="text-left font-medium text-gray-500 pb-2 text-xs">
              Required Hours
            </th>
            <th className="text-right font-medium text-gray-500 pb-2 text-xs">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((req) =>
            editingId === req.id ? (
              <RowForm
                key={req.id}
                row={row}
                setRow={setRow}
                onSave={handleSave}
                onCancel={cancel}
                loading={isUpdating}
              />
            ) : (
              <tr key={req.id} className="border-b border-gray-50 last:border-0">
                <td className="py-2 text-gray-700">Year {req.yearLevel}</td>
                <td className="py-2 text-gray-700">{req.requiredHours} hrs</td>
                <td className="py-2 text-right">
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => startEdit(req)}
                      className="p-1 rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50"
                      aria-label={`Edit Year ${req.yearLevel} requirement`}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(req)}
                      className="p-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                      aria-label={`Delete Year ${req.yearLevel} requirement`}
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
          No requirements yet — add one for each year level this program sends
          students on OJT.
        </p>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Requirement?"
        message={
          deleteTarget
            ? `Delete the Year ${deleteTarget.yearLevel} requirement (${deleteTarget.requiredHours} hrs)? This cannot be undone.`
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
  onSave,
  onCancel,
  loading,
}: {
  row: typeof EMPTY_ROW;
  setRow: (row: typeof EMPTY_ROW) => void;
  onSave: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <tr className="border-b border-gray-50 last:border-0 bg-blue-50/40">
      <td className="py-2 pr-2">
        <input
          type="number"
          min={1}
          value={row.yearLevel}
          onChange={(e) => setRow({ ...row, yearLevel: e.target.value })}
          placeholder="Year"
          className="w-20 h-8 px-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white placeholder:text-gray-400"
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          min={0}
          value={row.requiredHours}
          onChange={(e) => setRow({ ...row, requiredHours: e.target.value })}
          placeholder="Hours"
          className="w-24 h-8 px-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white placeholder:text-gray-400"
        />
      </td>
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
