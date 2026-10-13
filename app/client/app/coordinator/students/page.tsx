"use client";

import { Suspense, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { COORDINATOR_NAV } from "@/features/coordinator/nav";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import CredentialsDialog from "@/components/ui/CredentialsDialog";
import Button from "@/components/ui/Button";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import {
  Users,
  Plus,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  UserCheck,
} from "lucide-react";
import { useStudents } from "@/features/student/hooks/use-students";
import type { Student } from "@/lib/api/studentApi";
import StudentList from "@/features/student/components/StudentList";
import StudentFilterBar from "@/features/student/components/StudentFilterBar";
import StudentViewDialog from "@/features/student/components/StudentViewDialog";
import StudentEditDialog from "@/features/student/components/StudentEditDialog";
import ResendLoginDialog from "@/features/account/components/ResendLoginDialog";
import StudentImportDialog from "@/features/student-import/components/StudentImportDialog";
import PlacementDialog from "@/features/student/components/PlacementDialog";
import { deleteStudentMessage } from "@/lib/format";

export default function StudentManagementPage() {
  // `useStudents` reads the roster's scope/filters from the URL
  // (`useSearchParams`), which Next requires a Suspense boundary for.
  return (
    <Suspense fallback={null}>
      <StudentManagementPageContent />
    </Suspense>
  );
}

function StudentManagementPageContent() {
  const currentUser = useCurrentUser();
  const [resetTarget, setResetTarget] = useState<Student | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [placementTarget, setPlacementTarget] = useState<Student | null>(null);
  const {
    form,
    error,
    establishments,
    isLoading,
    isCreating,
    isUpdating,
    deleteTarget,
    viewTarget,
    editTarget,
    isDialogOpen,
    credentials,
    search,
    page,
    paged,
    totalPages,
    stats,
    roster,
    noBlocksAssigned,
    hasOwnBlocks,
    courses,
    filterBlocks,
    STATUS_OPTIONS,
    formYearLevelOptions,
    formBlocks,
    setField,
    setCourseField,
    setYearLevelField,
    setSearch,
    setPage,
    setDeleteTarget,
    setViewTarget,
    closeCredentials,
    handleSubmit,
    handleDeleteConfirm,
    handleView,
    handleEdit,
    handleOpenAddDialog,
    closeDialog,
  } = useStudents();

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
            title="Student Management"
            subtitle="Manage OJT students, their assignments and progress"
            icon={Users}
          />
          <div className="flex flex-wrap gap-2 self-start md:self-auto">
            <Button
              icon={FileSpreadsheet}
              variant="secondary"
              onClick={() => {
                setImportOpen(true);
              }}
              fullWidth={false}
              className="px-4"
            >
              Import from Excel
            </Button>
            <Button
              icon={Plus}
              onClick={handleOpenAddDialog}
              fullWidth={false}
              className="px-4"
            >
              Add Student
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          <StatCard
            label="Total Students"
            value={stats.total}
            icon={Users}
            variant="accent"
          />
          <StatCard
            label="Active"
            value={stats.active}
            icon={UserCheck}
            subtext="Currently on OJT"
          />
          <StatCard
            label="In Progress"
            value={stats.inProgress}
            icon={Clock}
            subtext="Hours not yet met"
          />
          <StatCard
            label="Completed"
            value={stats.completed}
            icon={CheckCircle2}
            subtext="Finished program"
          />
        </div>

        <Card>
          <StudentFilterBar
            scope={roster.scope}
            hasOwnBlocks={hasOwnBlocks}
            noBlocksAssigned={noBlocksAssigned}
            courseId={roster.courseId}
            yearLevel={roster.yearLevel}
            blockId={roster.blockId}
            academicYear={roster.academicYear}
            status={roster.status}
            courses={courses}
            filterBlocks={filterBlocks}
            statusOptions={STATUS_OPTIONS}
            onScopeChange={roster.setScope}
            onCourseChange={roster.setCourseId}
            onYearLevelChange={roster.setYearLevel}
            onBlockChange={roster.setBlockId}
            onAcademicYearChange={roster.setAcademicYear}
            onStatusChange={roster.setStatus}
          />
          <StudentList
            isLoading={isLoading}
            search={search}
            page={page}
            totalPages={totalPages}
            paged={paged}
            onSearchChange={setSearch}
            onPageChange={setPage}
            onView={handleView}
            onEdit={handleEdit}
            onDelete={(student) => {
              setDeleteTarget(student);
            }}
            onResendLogin={(student) => {
              setResetTarget(student);
            }}
            onPlace={(student) => {
              setPlacementTarget(student);
            }}
          />
        </Card>
      </main>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Student?"
        message={
          deleteTarget
            ? deleteStudentMessage(deleteTarget.user.name, {
                attendances: deleteTarget._count?.attendances ?? 0,
                evaluations: deleteTarget._count?.evaluations ?? 0,
                documents: deleteTarget._count?.documents ?? 0,
                credentials: deleteTarget._count?.credentials ?? 0,
              })
            : ""
        }
        confirmLabel="Yes, delete permanently"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />

      <StudentViewDialog
        open={!!viewTarget}
        student={viewTarget}
        onClose={() => {
          setViewTarget(null);
        }}
        onPlace={(student) => {
          setPlacementTarget(student);
        }}
      />

      <StudentEditDialog
        open={isDialogOpen}
        form={form}
        editTarget={editTarget}
        isCreating={isCreating}
        isUpdating={isUpdating}
        error={error}
        establishments={establishments || []}
        courses={courses}
        yearLevelOptions={formYearLevelOptions}
        blocks={formBlocks}
        statusOptions={STATUS_OPTIONS}
        setField={setField}
        onCourseChange={setCourseField}
        onYearLevelChange={setYearLevelField}
        onSubmit={handleSubmit}
        onClose={closeDialog}
      />

      <ResendLoginDialog
        target={
          resetTarget && {
            userId: resetTarget.userId,
            name: resetTarget.user.name,
            email: resetTarget.user.email,
            identifier: resetTarget.user.username ?? resetTarget.user.email,
          }
        }
        onClose={() => {
          setResetTarget(null);
        }}
      />

      {credentials && (
        <CredentialsDialog
          open
          name={credentials.name}
          identifier={credentials.identifier}
          temporaryPassword={credentials.temporaryPassword}
          reason={credentials.reason}
          onClose={closeCredentials}
        />
      )}

      <StudentImportDialog
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
        }}
      />

      <PlacementDialog
        student={placementTarget}
        onClose={() => {
          setPlacementTarget(null);
        }}
      />
    </div>
  );
}
