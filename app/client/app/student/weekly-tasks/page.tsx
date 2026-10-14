"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { CheckCircle2, ListChecks, Printer, Undo2 } from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { STUDENT_NAV } from "@/features/student-portal/nav";
import { useStudentWeeklyTasks } from "@/features/weekly-tasks/hooks/use-student-weekly-tasks";
import WeekNavigator from "@/features/weekly-tasks/components/WeekNavigator";
import WeekSummary from "@/features/weekly-tasks/components/WeekSummary";
import WeeklyTaskCard from "@/features/weekly-tasks/components/WeeklyTaskCard";
import MarkDoneDialog from "@/features/weekly-tasks/components/MarkDoneDialog";

const ACTION_BUTTON =
  "px-2 py-1.5 rounded-md border inline-flex items-center gap-1 text-xs font-medium";

export default function StudentWeeklyTasksPage() {
  // The week can arrive in the URL (a notification links straight to it), and
  // `useSearchParams` needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <StudentWeeklyTasksContent />
    </Suspense>
  );
}

function StudentWeeklyTasksContent() {
  const currentUser = useCurrentUser();
  const searchParams = useSearchParams();
  const tasks = useStudentWeeklyTasks({ week: searchParams.get("week") });
  const { data } = tasks;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50">
      <Sidebar
        items={STUDENT_NAV}
        userName={currentUser?.name || "Student"}
      />

      <main className="flex-1 min-w-0 p-4 md:p-6">
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-2xl p-4 md:p-6 mb-6">
          <PageHeader
            title="Weekly Tasks"
            subtitle="The tasks your supervisor assigned for the week, and how each was rated"
            icon={ListChecks}
          />
        </div>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <WeekNavigator
              weekStart={tasks.week}
              isCurrentWeek={tasks.isCurrentWeek}
              onPrev={tasks.goPrevWeek}
              onNext={tasks.goNextWeek}
              onThisWeek={tasks.goThisWeek}
            />
            {data?.assignment && (
              <Link
                href={`/student/weekly-tasks/print?assignment=${data.assignment.id}&week=${tasks.week}`}
                className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Printer size={16} />
                Print weekly report
              </Link>
            )}
          </div>

          {tasks.loadError ? (
            <p role="alert" className="text-sm text-red-600 py-8 text-center">
              {tasks.loadError}
            </p>
          ) : !data || tasks.isLoading ? (
            <p className="text-sm text-gray-400">Loading tasks...</p>
          ) : !data.assignment ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              You have no training placement yet, so there are no tasks to
              show. Your coordinator will record your placement.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                {data.assignment.establishment.name}
              </p>
              <WeekSummary summary={data.summary} />

              {data.tasks.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">
                  No tasks were assigned for this week.
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.tasks.map((task) => (
                    <WeeklyTaskCard
                      key={task.id}
                      task={task}
                      actions={
                        task.status === "ASSIGNED" ? (
                          <button
                            type="button"
                            onClick={() => {
                              tasks.openDone(task);
                            }}
                            className={`${ACTION_BUTTON} border-green-200 text-green-700 hover:bg-green-50`}
                          >
                            <CheckCircle2 size={14} />
                            Mark as done
                          </button>
                        ) : task.status === "DONE" ? (
                          <button
                            type="button"
                            onClick={() => {
                              tasks.setUndoTarget(task);
                            }}
                            className={`${ACTION_BUTTON} border-gray-300 text-gray-700 hover:bg-gray-50`}
                          >
                            <Undo2 size={14} />
                            Undo
                          </button>
                        ) : undefined
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      </main>

      <MarkDoneDialog
        task={tasks.doneTarget}
        note={tasks.note}
        photos={tasks.photos}
        photoSlotsLeft={tasks.photoSlotsLeft}
        photoErrors={tasks.photoErrors}
        error={tasks.doneError}
        isSubmitting={tasks.isSubmitting}
        onNoteChange={tasks.setNote}
        onPhotosChange={tasks.handlePhotosChange}
        onRemovePhoto={tasks.removePhoto}
        onSubmit={tasks.handleDoneSubmit}
        onClose={tasks.closeDone}
      />

      <ConfirmDialog
        open={!!tasks.undoTarget}
        title="Undo “done”?"
        message={
          tasks.undoTarget
            ? `"${tasks.undoTarget.title}" goes back to Assigned. Your note and any proof photos you attached will be removed — you can add them again when you mark it done.`
            : ""
        }
        confirmLabel="Yes, undo it"
        icon={Undo2}
        variant="danger"
        onConfirm={tasks.handleUndoConfirm}
        onCancel={() => {
          tasks.setUndoTarget(null);
        }}
      />
    </div>
  );
}
