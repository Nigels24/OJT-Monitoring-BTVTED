import { BookOpen, X } from "lucide-react";
import Overlay from "@/components/ui/Overlay";
import { Course, CoordinatorSummary } from "@/lib/api/courseApi";
import RequirementsPanel from "./RequirementsPanel";
import BlocksPanel from "./BlocksPanel";

interface CourseDetailDialogProps {
  course: Course | null;
  coordinators: CoordinatorSummary[];
  onClose: () => void;
}

/** Per-course requirements and blocks, in one panel (goal 3: "expand row or
 * detail panel"). Stays open across add/edit/delete of either — `course` is
 * derived live from the courses list by the caller, not a stale snapshot. */
export default function CourseDetailDialog({
  course,
  coordinators,
  onClose,
}: CourseDetailDialogProps) {
  if (!course) return null;

  return (
    <Overlay open label={`Manage ${course.code}`} onClose={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-blue-600" />
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-gray-900">
                {course.code}
              </h2>
              <p className="text-xs text-gray-500">{course.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8">
          <RequirementsPanel courseId={course.id} requirements={course.requirements} />
          <div className="border-t border-gray-200 pt-6">
            <BlocksPanel
              courseId={course.id}
              blocks={course.blocks}
              coordinators={coordinators}
            />
          </div>
        </div>
      </div>
    </Overlay>
  );
}
