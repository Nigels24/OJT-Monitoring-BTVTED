"use client";

import Sidebar from "@/components/layout/Sidebar";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { COORDINATOR_NAV } from "@/features/coordinator/nav";
import { ANNOUNCEMENT_AUDIENCE_LABEL } from "@/lib/api/announcementApi";
import { useAnnouncementAdmin } from "@/features/announcements/hooks/use-announcement-admin";
import AnnouncementFormDialog from "@/features/announcements/components/AnnouncementFormDialog";

/**
 * Announcements the coordinator posts to students, supervisors or both,
 * optionally limited to a program or block. They are kept until deleted here —
 * they are not messages and are never auto-deleted.
 */
export default function CoordinatorAnnouncementsPage() {
  const currentUser = useCurrentUser();
  const admin = useAnnouncementAdmin();

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50">
      <Sidebar
        items={COORDINATOR_NAV}
        userName={currentUser?.name || "Coordinator"}
      />

      <main className="flex-1 min-w-0 p-4 md:p-6">
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-2xl p-4 md:p-6 mb-6">
          <PageHeader
            title="Announcements"
            subtitle="Post to students, supervisors or both — optionally to one program or block"
            icon={Megaphone}
          />
        </div>

        <Card>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-base md:text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Megaphone size={18} className="text-blue-600" />
              Posted Announcements
            </h2>
            <button
              type="button"
              onClick={admin.openCreate}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
            >
              <Plus size={16} />
              New announcement
            </button>
          </div>

          {admin.isError ? (
            <p role="alert" className="text-sm text-red-600 py-8 text-center">
              Could not load announcements.
            </p>
          ) : admin.isLoading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : admin.announcements.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              No announcements have been posted yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {admin.announcements.map((announcement) => (
                <li
                  key={announcement.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 break-words">
                        {announcement.title}
                      </p>
                      <p className="text-xs text-gray-500 break-words">
                        {[
                          `To: ${ANNOUNCEMENT_AUDIENCE_LABEL[announcement.audience]}`,
                          announcement.course
                            ? announcement.course.code
                            : "all programs",
                          announcement.block
                            ? announcement.block.name
                            : "all blocks",
                          `by ${announcement.postedBy.user.name}`,
                          new Date(announcement.createdAt).toLocaleDateString(),
                          `read by ${announcement.readCount}`,
                        ].join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          admin.openEdit(announcement);
                        }}
                        className="p-1.5 rounded-md border border-amber-200 text-amber-600 hover:bg-amber-50"
                        aria-label={`Edit ${announcement.title}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          admin.setDeleteTarget(announcement);
                        }}
                        className="p-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                        aria-label={`Delete ${announcement.title}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2">
                    {announcement.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>

      <AnnouncementFormDialog
        open={admin.isFormOpen}
        isEditing={admin.isEditing}
        form={admin.form}
        error={admin.error}
        isSaving={admin.isSaving}
        courseOptions={admin.courseOptions}
        blockOptions={admin.blockOptions}
        setField={admin.setField}
        onSubmit={admin.handleSubmit}
        onClose={admin.closeForm}
      />

      <ConfirmDialog
        open={!!admin.deleteTarget}
        title="Delete this announcement?"
        message={
          admin.deleteTarget
            ? `"${admin.deleteTarget.title}" will disappear for everyone it was sent to. This can't be undone.`
            : ""
        }
        confirmLabel="Yes, delete it"
        icon={Trash2}
        variant="danger"
        onConfirm={admin.handleDeleteConfirm}
        onCancel={() => {
          admin.setDeleteTarget(null);
        }}
      />
    </div>
  );
}
