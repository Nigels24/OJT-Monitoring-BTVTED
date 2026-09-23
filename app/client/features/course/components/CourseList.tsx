import { Search, Eye, Pencil, Trash2, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import DataTable, { DataTableColumn } from "@/components/ui/DataTable";
import { Course } from "@/lib/api/courseApi";

interface CourseListProps {
  courses: Course[];
  isLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onManage: (course: Course) => void;
  onEdit: (course: Course) => void;
  onDelete: (course: Course) => void;
  onToggleActive: (course: Course) => void;
}

export default function CourseList({
  courses,
  isLoading,
  search,
  onSearchChange,
  onManage,
  onEdit,
  onDelete,
  onToggleActive,
}: CourseListProps) {
  const [localSearch, setLocalSearch] = useState(search);
  // Keeps localSearch in step with an externally-cleared `search` prop — a
  // synchronous render-body adjustment (see Overlay.tsx's `wasOpen`
  // comment), not a `useEffect`, since the latter would call setState
  // straight from the effect body.
  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    setLocalSearch(search);
  }

  useEffect(() => {
    const handler = setTimeout(() => {
      onSearchChange(localSearch);
    }, 300);
    return () => {
      clearTimeout(handler);
    };
  }, [localSearch, onSearchChange]);

  const columns: DataTableColumn<Course>[] = [
    {
      key: "code",
      label: "Code",
      render: (r) => (
        <span className="font-mono text-xs font-semibold text-gray-900">
          {r.code}
        </span>
      ),
    },
    { key: "name", label: "Program", render: (r) => r.name },
    {
      key: "requirements",
      label: "Required Hours by Year",
      render: (r) =>
        r.requirements.length === 0 ? (
          <span className="text-gray-400 italic text-xs">No requirements yet</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {r.requirements
              .slice()
              .sort((a, b) => a.yearLevel - b.yearLevel)
              .map((req) => (
                <span
                  key={req.id}
                  className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 whitespace-nowrap"
                >
                  Year {req.yearLevel} - {req.requiredHours} hrs
                </span>
              ))}
          </div>
        ),
    },
    {
      key: "blocks",
      label: "Blocks",
      render: (r) => r.blocks.length,
    },
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <button
          onClick={() => onToggleActive(r)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            r.isActive
              ? "bg-green-100 text-green-700 hover:bg-green-200"
              : "bg-red-100 text-red-700 hover:bg-red-200"
          }`}
          title="Click to toggle"
        >
          {r.isActive ? "Active" : "Inactive"}
        </button>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (r) => (
        <div className="flex gap-1 md:gap-2">
          <button
            onClick={() => onManage(r)}
            className="p-1 md:p-1.5 rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50"
            aria-label={`Manage ${r.code}`}
            title="Manage requirements & blocks"
          >
            <Eye size={14} />
          </button>
          <button
            onClick={() => onEdit(r)}
            className="p-1 md:p-1.5 rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50"
            aria-label={`Edit ${r.code}`}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(r)}
            className="p-1 md:p-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
            aria-label={`Delete ${r.code}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="mt-6">
      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          value={localSearch}
          onChange={(e) => {
            setLocalSearch(e.target.value);
          }}
          placeholder="Search by course code or name..."
          className="w-full h-10 md:h-12 pl-9 md:pl-11 pr-3 md:pr-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 placeholder-gray-400"
        />
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : courses.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">
          No courses yet. Add one to start defining OJT requirements.
        </p>
      ) : (
        <DataTable
          title=""
          icon={BookOpen}
          columns={columns}
          data={courses}
          keyField="id"
        />
      )}
    </div>
  );
}
