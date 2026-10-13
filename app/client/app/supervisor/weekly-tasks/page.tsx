"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import SelectField from "@/components/ui/SelectField";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { ListChecks, Pencil, Plus, Printer, Star, Trash2 } from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { SUPERVISOR_NAV } from "@/features/supervisor/nav";
import { useSupervisorWeeklyTasks } from "@/features/weekly-tasks/hooks/use-supervisor-weekly-tasks";
import WeekNavigator from "@/features/weekly-tasks/components/WeekNavigator";
import WeekSummary from "@/features/weekly-tasks/components/WeekSummary";
import WeeklyTaskCard from "@/features/weekly-tasks/components/WeeklyTaskCard";
import TaskFormDialog from "@/features/weekly-tasks/components/TaskFormDialog";
import RateTaskDialog from "@/features/weekly-tasks/components/RateTaskDialog";

const ACTION_BUTTON =
  "px-2 py-1.5 rounded-md border inline-flex items-center gap-1 text-xs font-medium";

export default function SupervisorWeeklyTasksPage() {
  // The trainee and week can arrive in the URL (a notification links straight
  // to them), and `useSearchParams` needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <SupervisorWeeklyTasksContent />
    </Suspense>
  );
}

function SupervisorWeeklyTasksContent() {
  const currentUser = useCurrentUser();
  const searchParams = useSearchParams();
  const tasks = useSupervisorWeeklyTasks({
    assignmentId: searchParams.get("assignment"),
    week: searchParams.get("week"),
  });
  const { data } = tasks;

  const traineeOptions = tasks.students.map((student) => ({
    label: `${student.user.name} — ${student.studentIdNumber}${
      student.assignmentStatus === "ACTIVE" ? "" : " (no longer active here)"
    }`,
    value: student.assignmentId,
  }));
  // A linked placement that has dropped off the roster is still readable.
  if (
    tasks.assignmentId &&
    data?.student &&
    !traineeOptions.some((option) => option.value === tasks.assignmentId)
  ) {
    traineeOptions.unshift({
      label: `${data.student.name} — ${data.student.studentIdNumber} (past placement)`,
      value: tasks.assignmentId,
    });
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        orgName="WPH Institute"
        orgSubtitle="OJT Monitoring"
        items={SUPERVISOR_NAV}
        userName={currentUser?.name || "Supervisor"}
      />

      <main className="flex-1 p-4 md:p-6">
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-2xl p-4 md:p-6 mb-6">
          <PageHeader
            title="Weekly Tasks"
            subtitle="Assign each trainee's tasks for the week and rate them once they are done"
            icon={ListChecks}
          />
        </div>

        <Card className="mb-4">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div className="lg:w-96">
              <span className="block text-sm font-medium text-gray-700 mb-1.5">
                Trainee
              </span>
              <SelectField
                value={tasks.assignmentId}
                onChange={tasks.setAssignmentId}
                placeholder={
                  tasks.isRosterLoading
                    ? "Loading trainees..."
                    : "Select a trainee"
                }
                options={traineeOptions}
                disabled={traineeOptions.length === 0}
              />
            </div>
            <WeekNavigator
              weekStart={tasks.week}
              isCurrentWeek={tasks.isCurrentWeek}
              onPrev={tasks.goPrevWeek}
              onNext={tasks.goNextWeek}
              onThisWeek={tasks.goThisWeek}
            />
          </div>
        </Card>

        <Card>
          {!tasks.assignmentId ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              {tasks.isRosterLoading
                ? "Loading..."
                : "No trainees are placed at your establishment yet."}
            </p>
          ) : tasks.loadError ? (
            <p role="alert" className="text-sm text-red-600 py-8 text-center">
              {tasks.loadError}
            </p>
          ) : !data || tasks.isLoading ? (
            <p className="text-sm text-gray-400">Loading tasks...</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base md:text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <ListChecks size={18} className="text-blue-600" />
                  {data.student?.name}&apos;s tasks
                </h2>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/supervisor/weekly-tasks/print?assignment=${tasks.assignmentId}&week=${tasks.week}`}
                    className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Printer size={16} />
                    Print report
                  </Link>
                  {tasks.canAssign && (
                    <button
                      type="button"
                      onClick={tasks.openCreate}
                      className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
                    >
                      <Plus size={16} />
                      Assign task
                    </button>
                  )}
                </div>
              </div>

              {!tasks.canAssign && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  This placement is no longer active, so tasks cannot be
                  assigned or changed. Tasks already marked done can still be
                  rated.
                </p>
              )}

              <WeekSummary summary={data.summary} />

              {data.tasks.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">
                  No tasks assigned for this week yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.tasks.map((task) => (
                    <WeeklyTaskCard
                      key={task.id}
                      task={task}
                      actions={
                        <>
                          {task.status === "ASSIGNED" && tasks.canAssign && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  tasks.openEdit(task);
                                }}
                                className={`${ACTION_BUTTON} border-amber-200 text-amber-700 hover:bg-amber-50`}
                              >
                                <Pencil size={14} />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  tasks.setDeleteTarget(task);
                                }}
                                className={`${ACTION_BUTTON} border-red-200 text-red-600 hover:bg-red-50`}
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </>
                          )}
                          {task.status !== "ASSIGNED" && (
                            <button
                              type="button"
                              onClick={() => {
                                tasks.openRate(task);
                              }}
                              className={`${ACTION_BUTTON} border-blue-200 text-blue-700 hover:bg-blue-50`}
                            >
                              <Star size={14} />
                              {task.status === "RATED" ? "Update rating" : "Rate"}
                            </button>
                          )}
                        </>
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      </main>

      <TaskFormDialog
        open={tasks.isFormOpen}
        isEditing={tasks.isEditing}
        traineeName={data?.student?.name ?? "Trainee"}
        weekStart={tasks.week}
        form={tasks.form}
        error={tasks.formError}
        isSaving={tasks.isSaving}
        setField={tasks.setFormField}
        onSubmit={tasks.handleFormSubmit}
        onClose={tasks.closeForm}
      />

      <RateTaskDialog
        task={tasks.rateTarget}
        rating={tasks.rating}
        comment={tasks.comment}
        error={tasks.rateError}
        isSaving={tasks.isRating}
        onRatingChange={tasks.setRating}
        onCommentChange={tasks.setComment}
        onSubmit={tasks.handleRateSubmit}
        onClose={tasks.closeRate}
      />

      <ConfirmDialog
        open={!!tasks.deleteTarget}
        title="Delete this task?"
        message={
          tasks.deleteTarget
            ? `"${tasks.deleteTarget.title}" will be removed from the trainee's week. This can't be undone.`
            : ""
        }
        confirmLabel="Yes, delete it"
        icon={Trash2}
        variant="danger"
        onConfirm={tasks.handleDeleteConfirm}
        onCancel={() => {
          tasks.setDeleteTarget(null);
        }}
      />
    </div>
  );
}
