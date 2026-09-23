"use client";

import Sidebar from "@/components/layout/Sidebar";
import { COORDINATOR_NAV } from "@/features/coordinator/nav";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Button from "@/components/ui/Button";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { BookOpen, Plus } from "lucide-react";
import { useCourses } from "@/features/course/hooks/use-courses";
import CourseList from "@/features/course/components/CourseList";
import CourseFormDialog from "@/features/course/components/CourseFormDialog";
import CourseDetailDialog from "@/features/course/components/CourseDetailDialog";

export default function CourseManagementPage() {
  const currentUser = useCurrentUser();
  const {
    courses,
    coordinators,
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
  } = useCourses();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        orgName="WPH Institute"
        orgSubtitle="Barangay San Francisco"
        items={COORDINATOR_NAV}
        userName={currentUser?.name || "Coordinator"}
      />

      <main className="flex-1 p-4 md:p-6">
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-2xl p-4 md:p-6 mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <PageHeader
            title="Course Management"
            subtitle="Programs, per-year-level OJT hour requirements, and blocks"
            icon={BookOpen}
          />
          <Button
            icon={Plus}
            onClick={handleOpenAddDialog}
            fullWidth={false}
            className="self-start md:self-auto"
          >
            Add Course
          </Button>
        </div>

        <Card>
          <CourseList
            courses={courses}
            isLoading={isLoading}
            search={search}
            onSearchChange={setSearch}
            onManage={(course) => {
              setDetailCourseId(course.id);
            }}
            onEdit={handleEdit}
            onDelete={(course) => {
              setDeleteTarget(course);
            }}
            onToggleActive={handleToggleActive}
          />
        </Card>
      </main>

      <CourseFormDialog
        open={isDialogOpen}
        form={form}
        editTarget={editTarget}
        isCreating={isCreating}
        isUpdating={isUpdating}
        error={error}
        setField={setField}
        setActive={setActive}
        onSubmit={handleSubmit}
        onClose={closeDialog}
      />

      <CourseDetailDialog
        course={detailCourse}
        coordinators={coordinators}
        onClose={() => {
          setDetailCourseId(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Course?"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.code} — ${deleteTarget.name}"? This is blocked if any student, block, or requirement still references it — set it to Inactive instead if you just want to stop using it.`
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
