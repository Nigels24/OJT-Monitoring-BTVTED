import { Users, Globe } from "lucide-react";
import SelectField from "@/components/ui/SelectField";
import { StudentStatus } from "@/lib/api/studentApi";
import { Block, Course } from "@/lib/api/courseApi";
import {
  TRAINING_STATUS_LABEL,
  TRAINING_STATUS_OPTIONS,
} from "@/features/reports/filters";

const STATUS_LABEL: Record<StudentStatus, string> = {
  ACTIVE: "Active",
  PENDING: "Pending",
  COMPLETED: "Completed",
  INACTIVE: "Inactive",
};

interface StudentFilterBarProps {
  scope: "block" | "all";
  hasOwnBlocks: boolean;
  noBlocksAssigned: boolean;
  courseId: string;
  yearLevel: string;
  blockId: string;
  academicYear: string;
  academicYearFrom: string;
  academicYearTo: string;
  establishmentId: string;
  trainingStatus: string;
  status: string;
  establishments: { id: string; name: string }[];
  courses: Course[];
  filterBlocks: Block[];
  statusOptions: StudentStatus[];
  onScopeChange: (scope: "block" | "all") => void;
  onCourseChange: (value: string) => void;
  onYearLevelChange: (value: string) => void;
  onBlockChange: (value: string) => void;
  onAcademicYearChange: (value: string) => void;
  onAcademicYearFromChange: (value: string) => void;
  onAcademicYearToChange: (value: string) => void;
  onEstablishmentChange: (value: string) => void;
  onTrainingStatusChange: (value: string) => void;
  onStatusChange: (value: string) => void;
}

/**
 * "My Block / All Program" toggle plus course/year level/block/academic
 * year (one, or a range)/establishment/training status/account status filters
 * — all applied by the server and all kept in the URL (Table 1: a coordinator sees their own block's
 * trainees by default and can switch to a program-wide view).
 */
export default function StudentFilterBar({
  scope,
  hasOwnBlocks,
  noBlocksAssigned,
  courseId,
  yearLevel,
  blockId,
  academicYear,
  academicYearFrom,
  academicYearTo,
  establishmentId,
  trainingStatus,
  status,
  establishments,
  courses,
  filterBlocks,
  statusOptions,
  onScopeChange,
  onCourseChange,
  onYearLevelChange,
  onBlockChange,
  onAcademicYearChange,
  onAcademicYearFromChange,
  onAcademicYearToChange,
  onEstablishmentChange,
  onTrainingStatusChange,
  onStatusChange,
}: StudentFilterBarProps) {
  const selectedCourse = courses.find((c) => c.id === courseId) ?? null;
  const yearLevelOptions = (selectedCourse?.requirements ?? [])
    .map((r) => r.yearLevel)
    .sort((a, b) => a - b);
  // Every academic year any block has, whichever course is picked: the year
  // filters work without a course.
  const academicYears = Array.from(
    new Set(courses.flatMap((c) => (c.blocks ?? []).map((b) => b.academicYear))),
  ).sort();
  const yearOptions = academicYears.map((year) => ({ label: year, value: year }));

  return (
    <div className="mb-4 space-y-3">
      <div
        className="inline-flex rounded-lg border border-gray-300 bg-white p-1"
        title={
          !hasOwnBlocks
            ? "You have no blocks assigned yet — showing the full program roster."
            : undefined
        }
      >
        <button
          type="button"
          disabled={!hasOwnBlocks}
          onClick={() => onScopeChange("block")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
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
      {noBlocksAssigned && scope === "block" && (
        <p className="text-xs text-amber-600">
          You have no blocks assigned yet, so this is showing every student in
          the program. Ask a coordinator to assign you a block in Course
          Management to narrow this view.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SelectField
          value={courseId}
          onChange={onCourseChange}
          placeholder="All Courses"
          options={[
            { label: "All Courses", value: "" },
            ...courses.map((c) => ({ label: c.code, value: c.id })),
          ]}
        />
        <SelectField
          value={yearLevel}
          onChange={onYearLevelChange}
          placeholder="All Year Levels"
          disabled={!courseId}
          options={[
            { label: "All Year Levels", value: "" },
            ...yearLevelOptions.map((y) => ({
              label: `Year ${y}`,
              value: String(y),
            })),
          ]}
        />
        <SelectField
          value={blockId}
          onChange={onBlockChange}
          placeholder="All Blocks"
          disabled={!courseId}
          options={[
            { label: "All Blocks", value: "" },
            ...filterBlocks.map((b) => ({
              label: `${b.name} (${b.academicYear})`,
              value: b.id,
            })),
          ]}
        />
        <SelectField
          value={academicYear}
          onChange={onAcademicYearChange}
          placeholder="All Academic Years"
          options={[
            { label: "All Academic Years", value: "" },
            ...yearOptions,
          ]}
        />
        <SelectField
          value={academicYearFrom}
          onChange={onAcademicYearFromChange}
          placeholder="A.Y. from"
          options={[{ label: "A.Y. from (any)", value: "" }, ...yearOptions]}
        />
        <SelectField
          value={academicYearTo}
          onChange={onAcademicYearToChange}
          placeholder="A.Y. to"
          options={[{ label: "A.Y. to (any)", value: "" }, ...yearOptions]}
        />
        <SelectField
          value={establishmentId}
          onChange={onEstablishmentChange}
          placeholder="All Establishments"
          options={[
            { label: "All Establishments", value: "" },
            ...establishments.map((e) => ({ label: e.name, value: e.id })),
          ]}
        />
        <SelectField
          value={trainingStatus}
          onChange={onTrainingStatusChange}
          placeholder="All Training Statuses"
          options={[
            { label: "All Training Statuses", value: "" },
            ...TRAINING_STATUS_OPTIONS.map((s) => ({
              label: TRAINING_STATUS_LABEL[s],
              value: s,
            })),
          ]}
        />
        <SelectField
          value={status}
          onChange={onStatusChange}
          placeholder="All Account Statuses"
          options={[
            { label: "All Account Statuses", value: "" },
            ...statusOptions.map((s) => ({ label: STATUS_LABEL[s], value: s })),
          ]}
        />
      </div>
    </div>
  );
}
