"use client";

import { MessageSquare, TriangleAlert } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import PageHeader from "@/components/ui/PageHeader";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { SUPERVISOR_NAV } from "@/features/supervisor/nav";
import { useMessaging } from "@/features/messaging/hooks/use-messaging";
import MessagingView from "@/features/messaging/components/MessagingView";
import RaiseConcernDialog from "@/features/concerns/components/RaiseConcernDialog";
import { useRaiseConcern } from "@/features/concerns/hooks/use-raise-concern";

export default function SupervisorMessagesPage() {
  const currentUser = useCurrentUser();
  const messaging = useMessaging();
  const concern = useRaiseConcern();

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50">
      <Sidebar
        items={SUPERVISOR_NAV}
        userName={currentUser?.name || "Supervisor"}
      />

      <main className="flex-1 min-w-0 p-4 md:p-6 flex flex-col">
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-2xl p-4 md:p-6 mb-6">
          <PageHeader
            title="Messages"
            subtitle="Talk to your students or the coordinator"
            icon={MessageSquare}
          />
        </div>

        <MessagingView
          {...messaging}
          // On a placement thread only: a concern is about one placement, and
          // it goes to the coordinator as a record — not into this thread,
          // where the trainee would read it.
          renderThreadAction={(conversation) =>
            conversation.isGroup && conversation.trainingAssignmentId ? (
              <button
                type="button"
                onClick={() => {
                  concern.open({
                    assignmentId: conversation.trainingAssignmentId!,
                    traineeName:
                      conversation.name?.split(" — ")[0] ?? "this trainee",
                  });
                }}
                className="px-2.5 py-1.5 rounded-md border border-amber-200 text-amber-700 hover:bg-amber-50 inline-flex items-center gap-1 text-xs font-medium"
              >
                <TriangleAlert size={14} />
                Raise concern
              </button>
            ) : null
          }
        />
      </main>

      <RaiseConcernDialog {...concern} />
    </div>
  );
}
