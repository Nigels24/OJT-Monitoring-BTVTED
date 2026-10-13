import { useState } from "react";
import {
  AnnouncementAudience,
  ManagedAnnouncement,
  useCreateAnnouncementMutation,
  useDeleteAnnouncementMutation,
  useGetManagedAnnouncementsQuery,
  useUpdateAnnouncementMutation,
} from "@/lib/api/announcementApi";
import { useGetBlocksQuery, useGetCoursesQuery } from "@/lib/api/courseApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";

export interface AnnouncementFormValues {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  /** "" = not limited to a program / block. */
  courseId: string;
  blockId: string;
}

const EMPTY_FORM: AnnouncementFormValues = {
  title: "",
  body: "",
  audience: "ALL",
  courseId: "",
  blockId: "",
};

/**
 * The coordinator's Announcements page: the list, and creating, editing and
 * deleting one. Who an announcement reaches is decided by the server from the
 * audience and the optional block/program — this only collects them.
 */
export function useAnnouncementAdmin() {
  const { showSuccess, showError } = useSnackbar();
  const { data: announcements, isLoading, isError } =
    useGetManagedAnnouncementsQuery();
  const { data: courses } = useGetCoursesQuery();
  const { data: blocks } = useGetBlocksQuery();

  const [createAnnouncement, { isLoading: isCreating }] =
    useCreateAnnouncementMutation();
  const [updateAnnouncement, { isLoading: isUpdating }] =
    useUpdateAnnouncementMutation();
  const [deleteAnnouncement] = useDeleteAnnouncementMutation();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagedAnnouncement | null>(null);
  const [form, setForm] = useState<AnnouncementFormValues>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ManagedAnnouncement | null>(
    null,
  );

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setError("");
    setIsFormOpen(true);
  };

  const openEdit = (announcement: ManagedAnnouncement) => {
    setEditTarget(announcement);
    setForm({
      title: announcement.title,
      body: announcement.body,
      audience: announcement.audience,
      courseId: announcement.courseId ?? "",
      blockId: announcement.blockId ?? "",
    });
    setError("");
    setIsFormOpen(true);
  };

  const setField = (key: keyof AnnouncementFormValues) => (value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      // A block belongs to one program, so changing the program drops a
      // block that would no longer match it.
      ...(key === "courseId" ? { blockId: "" } : {}),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      setError("Give the announcement a title and a message.");
      return;
    }
    setError("");
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      audience: form.audience,
      // Always sent: `null` is what removes a limit on an edit.
      courseId: form.courseId || null,
      blockId: form.blockId || null,
    };
    try {
      if (editTarget) {
        await updateAnnouncement({ id: editTarget.id, ...payload }).unwrap();
        showSuccess("Announcement updated.");
      } else {
        await createAnnouncement(payload).unwrap();
        showSuccess("Announcement posted. Its audience has been notified.");
      }
      setIsFormOpen(false);
    } catch (err: unknown) {
      const message = readError(err, "Failed to save the announcement.");
      setError(message);
      showError(message);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAnnouncement(deleteTarget.id).unwrap();
      showSuccess("Announcement deleted.");
    } catch (err: unknown) {
      showError(readError(err, "Failed to delete the announcement."));
    } finally {
      setDeleteTarget(null);
    }
  };

  return {
    announcements: announcements ?? [],
    isLoading,
    isError,
    courseOptions: (courses ?? []).map((course) => ({
      value: course.id,
      label: `${course.code} — ${course.name}`,
    })),
    // Only the chosen program's blocks, once one is chosen.
    blockOptions: (blocks ?? [])
      .filter((block) => !form.courseId || block.courseId === form.courseId)
      .map((block) => ({
        value: block.id,
        label: `${block.name} · Year ${block.yearLevel} · ${block.academicYear}`,
      })),

    isFormOpen,
    isEditing: !!editTarget,
    form,
    error,
    isSaving: isCreating || isUpdating,
    openCreate,
    openEdit,
    closeForm: () => setIsFormOpen(false),
    setField,
    handleSubmit,

    deleteTarget,
    setDeleteTarget,
    handleDeleteConfirm,
  };
}

function readError(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string | string[] } })?.data;
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message ?? fallback;
}
