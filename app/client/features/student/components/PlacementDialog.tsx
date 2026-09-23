import Link from "next/link";
import { MapPin, X, AlertTriangle } from "lucide-react";
import Overlay from "@/components/ui/Overlay";
import SelectField from "@/components/ui/SelectField";
import TextField from "@/components/ui/TextField";
import Button from "@/components/ui/Button";
import { Student } from "@/lib/api/studentApi";
import { DUTY_DAY_OPTIONS, usePlacement } from "../hooks/use-placement";

const DAY_LABEL: Record<string, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

interface PlacementDialogProps {
  student: Student | null;
  onClose: () => void;
}

export default function PlacementDialog({
  student,
  onClose,
}: PlacementDialogProps) {
  const {
    establishments,
    establishmentId,
    setEstablishmentId,
    requiredHours,
    setRequiredHours,
    defaults,
    defaultsError,
    isLoadingDefaults,
    dutyDays,
    toggleDutyDay,
    startDate,
    setStartDate,
    academicYear,
    setAcademicYear,
    blockId,
    setBlockId,
    blockOptions,
    activeAssignment,
    confirmed,
    setConfirmed,
    canSubmit,
    isSubmitting,
    error,
    handleSubmit,
  } = usePlacement(student, onClose);

  if (!student) return null;

  return (
    <Overlay
      open
      label="Record Placement"
      onClose={onClose}
      closeOnBackdrop={false}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <MapPin size={20} className="text-green-600" />
            <h2 className="text-lg md:text-xl font-semibold text-gray-900">
              Record Placement — {student.user.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5"
        >
          {activeAssignment && (
            <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <p>
                This will end the current placement at{" "}
                <strong>{activeAssignment.establishment.name}</strong> (status
                Transferred). Hours at the new establishment start at 0.
                Existing hours stay on the old record.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Establishment
            </label>
            <SelectField
              value={establishmentId}
              onChange={setEstablishmentId}
              placeholder="Select Establishment"
              options={establishments.map((e) => ({
                label: e.status === "INACTIVE" ? `${e.name} (Inactive)` : e.name,
                value: e.id,
                disabled: e.status === "INACTIVE",
              }))}
              className="w-full"
            />
          </div>

          <div>
            <TextField
              label="Required Hours"
              type="number"
              min={0}
              value={requiredHours}
              onChange={(e) => {
                setRequiredHours(e.target.value);
              }}
              disabled={isLoadingDefaults}
            />
            {defaults && (
              <p className="text-xs text-gray-500 mt-1.5">
                From the student&apos;s course, Year {defaults.yearLevel}{" "}
                requirement.
              </p>
            )}
            {defaultsError && (
              <p className="text-xs text-red-600 mt-1.5">
                {defaultsError}{" "}
                <Link
                  href="/coordinator/courses"
                  className="underline font-medium"
                >
                  Go to Course Management
                </Link>
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Duty Days
            </label>
            <div className="flex flex-wrap gap-2">
              {DUTY_DAY_OPTIONS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    toggleDutyDay(day);
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    dutyDays.includes(day)
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {DAY_LABEL[day]}
                </button>
              ))}
            </div>
            {dutyDays.length === 0 && (
              <p className="text-xs text-red-600 mt-1.5">
                Select at least one duty day.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField
              label="Start Date"
              type="date"
              required
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
              }}
            />
            <TextField
              label="Academic Year"
              required
              value={academicYear}
              onChange={(e) => {
                setAcademicYear(e.target.value);
              }}
              placeholder="2025-2026"
              pattern="\d{4}-\d{4}"
              title='Must look like "2025-2026"'
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Block (optional)
            </label>
            <SelectField
              value={blockId}
              onChange={setBlockId}
              placeholder="None"
              disabled={blockOptions.length === 0}
              options={[
                { label: "None", value: "" },
                ...blockOptions.map((b) => ({
                  label: `${b.name} (${b.academicYear})`,
                  value: b.id,
                })),
              ]}
              className="w-full"
            />
          </div>

          {activeAssignment && (
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => {
                  setConfirmed(e.target.checked);
                }}
                className="mt-0.5"
              />
              I understand this transfers the current placement and starts
              new hours at 0.
            </label>
          )}

          {error && (
            <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <div className="sm:w-56">
              <Button
                type="submit"
                icon={MapPin}
                loading={isSubmitting}
                disabled={!canSubmit}
              >
                Record Placement
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Overlay>
  );
}
