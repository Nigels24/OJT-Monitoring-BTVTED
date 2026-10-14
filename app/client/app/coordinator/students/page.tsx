"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
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
  Printer,
  MapPin,
  X,
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
import type { PlacementTarget } from "@/features/student/hooks/use-placement";
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
  const [placementTarget, setPlacementTarget] =
    useState<PlacementTarget | null>(null);
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
    justAdded,
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
    address,
    setAddress,
    setCourseField,
    setYearLevelField,
    setSearch,
    setPage,
    setDeleteTarget,
    setViewTarget,
    closeCredentials,
    dismissJustAdded,
    handleSubmit,
    handleDeleteConfirm,
    handleView,
    handleEdit,
    handleOpenAddDialog,
    closeDialog,
  } = useStudents();

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50">
      <Sidebar
        items={COORDINATOR_NAV}
        userName={currentUser?.name || "Coordinator"}
      />

      <main className="flex-1 min-w-0 p-4 md:p-6">
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-2xl p-4 md:p-6 mb-6 flex flex-wrap items-start justify-between gap-x-4">
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

        {/* A student is added without a placement. Offered here, and kept
            until acted on — a toast would be gone before the credentials
            dialog that can open over it is closed. */}
        {justAdded && (
          <div
            role="status"
            className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-green-300 bg-green-50 px-4 py-3"
          >
            <p className="flex-1 min-w-0 text-sm text-green-900">
              <strong>{justAdded.user.name}</strong> was added and has no
              placement yet.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setPlacementTarget(justAdded);
                  dismissJustAdded();
                }}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold"
              >
                <MapPin size={16} />
                Record placement now
              </button>
              <button
                type="button"
                onClick={dismissJustAdded}
                aria-label="Dismiss"
                className="w-10 h-10 flex items-center justify-center rounded-lg text-green-800 hover:bg-green-100"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        <Card>
          <StudentFilterBar
            scope={roster.scope}
            hasOwnBlocks={hasOwnBlocks}
            noBlocksAssigned={noBlocksAssigned}
            courseId={roster.courseId}
            yearLevel={roster.yearLevel}
            blockId={roster.blockId}
            academicYear={roster.academicYear}
            academicYearFrom={roster.academicYearFrom}
            academicYearTo={roster.academicYearTo}
            establishmentId={roster.establishmentId}
            trainingStatus={roster.trainingStatus}
            establishments={establishments ?? []}
            status={roster.status}
            courses={courses}
            filterBlocks={filterBlocks}
            statusOptions={STATUS_OPTIONS}
            onScopeChange={roster.setScope}
            onCourseChange={roster.setCourseId}
            onYearLevelChange={roster.setYearLevel}
            onBlockChange={roster.setBlockId}
            onAcademicYearChange={roster.setAcademicYear}
            onAcademicYearFromChange={roster.setAcademicYearFrom}
            onAcademicYearToChange={roster.setAcademicYearTo}
            onEstablishmentChange={roster.setEstablishmentId}
            onTrainingStatusChange={roster.setTrainingStatus}
            onStatusChange={roster.setStatus}
          />
          <div className="mb-4 -mt-1">
            <Link
              href={`/coordinator/reports/summary${
                roster.queryString ? `?${roster.queryString}` : ""
              }`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
            >
              <Printer size={14} />
              Print program / block summary for these filters
            </Link>
          </div>
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
        courses={courses}
        yearLevelOptions={formYearLevelOptions}
        blocks={formBlocks}
        statusOptions={STATUS_OPTIONS}
        setField={setField}
        address={address}
        setAddress={setAddress}
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
