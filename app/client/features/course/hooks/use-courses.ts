import { useMemo, useState } from "react";
import {
  useGetCoursesQuery,
  useCreateCourseMutation,
  useUpdateCourseMutation,
  useDeleteCourseMutation,
  useGetCoordinatorsQuery,
  Course,
} from "@/lib/api/courseApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";

const EMPTY_FORM = { code: "", name: "", isActive: true };

export type CourseForm = typeof EMPTY_FORM;

export function useCourses() {
  const { data: courses, isLoading } = useGetCoursesQuery();
  const { data: coordinators } = useGetCoordinatorsQuery();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<CourseForm>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [editTarget, setEditTarget] = useState<Course | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  // An id, not a snapshot: the detail dialog stays open while requirements
  // and blocks are added/edited/deleted underneath it, and re-deriving from
  // the live `courses` list on every render is what keeps it showing current
  // data without a manual refetch or a useEffect syncing a stale copy.
  const [detailCourseId, setDetailCourseId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [createCourse, { isLoading: isCreating }] = useCreateCourseMutation();
  const [updateCourse, { isLoading: isUpdating }] = useUpdateCourseMutation();
  const [deleteCourse] = useDeleteCourseMutation();

  const detailCourse = useMemo(
    () => (detailCourseId ? courses?.find((c) => c.id === detailCourseId) ?? null : null),
    [courses, detailCourseId],
  );

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return (courses ?? []).filter((c) =>
      `${c.code} ${c.name}`.toLowerCase().includes(term),
    );
  }, [courses, search]);

  const setField =
    (key: "code" | "name") => (e: { target: { value: string } }) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
    };
  const setActive = (isActive: boolean) => {
    setForm((f) => ({ ...f, isActive }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (editTarget) {
        await updateCourse({
          id: editTarget.id,
          code: form.code,
          name: form.name,
          isActive: form.isActive,
        }).unwrap();
        showSuccess(`"${form.code}" has been updated.`);
      } else {
        await createCourse({
          code: form.code,
          name: form.name,
          isActive: form.isActive,
        }).unwrap();
        showSuccess(`"${form.code}" has been created.`);
      }
      closeDialog();
    } catch (err: unknown) {
      const message = readError(
        err,
        editTarget ? "Failed to update course." : "Failed to create course.",
      );
      setError(message);
      showError(message);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCourse(deleteTarget.id).unwrap();
      showSuccess(`"${deleteTarget.code}" has been deleted.`);
      setDeleteTarget(null);
    } catch (err: unknown) {
      showError(readError(err, "Failed to delete course."));
      // Left open — the 409 message needs to stay visible on the confirm
      // dialog rather than silently closing on failure.
    }
  };

  const handleToggleActive = async (course: Course) => {
    try {
      await updateCourse({ id: course.id, isActive: !course.isActive }).unwrap();
      showSuccess(
        `"${course.code}" is now ${course.isActive ? "inactive" : "active"}.`,
      );
    } catch (err: unknown) {
      showError(readError(err, "Failed to update course."));
    }
  };

  const handleEdit = (course: Course) => {
    setEditTarget(course);
    setForm({ code: course.code, name: course.name, isActive: course.isActive });
    setIsDialogOpen(true);
  };

  const handleOpenAddDialog = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError("");
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError("");
  };

  return {
    courses: filtered,
    allCourses: courses ?? [],
    coordinators: coordinators ?? [],
    isLoading,
    form,
    error,
    editTarget,
    isDialogOpen,
    isCreating,
    isUpdating,
    deleteTarget,
    detailCourse,
    search,

    setField,
    setActive,
    setSearch,
    setDeleteTarget,
    setDetailCourseId,

    handleSubmit,
    handleDeleteConfirm,
    handleToggleActive,
    handleEdit,
    handleOpenAddDialog,
    closeDialog,
  };
}

function readError(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string | string[] } })?.data;
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message ?? fallback;
}
