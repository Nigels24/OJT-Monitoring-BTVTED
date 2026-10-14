"use client";

import Sidebar from "@/components/layout/Sidebar";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  FileText,
  ClipboardList,
  CheckCircle2,
  Hourglass,
  CircleDashed,
  Trash2,
} from "lucide-react";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { STUDENT_NAV } from "@/features/student-portal/nav";
import { useDocuments } from "@/features/student-portal/hooks/use-documents";
import DocumentChecklist from "@/features/student-portal/components/DocumentChecklist";
import DocumentUploadDialog from "@/features/document/components/DocumentUploadDialog";

export default function StudentDocumentsPage() {
  const currentUser = useCurrentUser();
  const documents = useDocuments();

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50">
      <Sidebar
        items={STUDENT_NAV}
        userName={currentUser?.name || "Student"}
      />

      <main className="flex-1 min-w-0 p-4 md:p-6">
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 rounded-2xl p-4 md:p-6 mb-6">
          <PageHeader
            title="Documents"
            subtitle="Upload each required document and track its review"
            icon={FileText}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <StatCard
            label="Approved"
            value={
              documents.isError
                ? "—"
                : `${documents.summary.approved}/${documents.summary.total}`
            }
            icon={CheckCircle2}
            variant="accent"
            subtext="requirements complete"
          />
          <StatCard
            label="Pending Review"
            value={documents.isError ? "—" : documents.summary.pending}
            icon={Hourglass}
            subtext="with your coordinator"
          />
          <StatCard
            label="Still Needed"
            value={
              documents.isError
                ? "—"
                : documents.summary.missing + documents.summary.returned
            }
            icon={CircleDashed}
            subtext={`${documents.summary.returned} returned for changes`}
          />
        </div>

        <Card>
          <h2 className="text-base md:text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <ClipboardList size={18} className="text-blue-600" />
            Required Documents
          </h2>
          <DocumentChecklist
            checklist={documents.checklist}
            isLoading={documents.isLoading}
            isError={documents.isError}
            onUpload={documents.openUpload}
            onDelete={documents.openDelete}
          />
        </Card>
      </main>

      <DocumentUploadDialog
        target={
          documents.uploadTarget
            ? {
                requirementName: documents.uploadTarget.requirement.name,
                replacing: documents.uploadTarget.document !== null,
              }
            : null
        }
        file={documents.file}
        error={documents.error}
        isSubmitting={documents.isUploading}
        onFileChange={documents.handleFileChange}
        onConfirm={documents.handleUploadConfirm}
        onCancel={documents.closeUpload}
      />

      <ConfirmDialog
        open={!!documents.deleteTarget}
        title="Delete this upload?"
        message={
          documents.deleteTarget
            ? `"${documents.deleteTarget.name}" will be permanently removed. This can't be undone.`
            : ""
        }
        confirmLabel={documents.isDeleting ? "Deleting..." : "Yes, delete it"}
        icon={Trash2}
        variant="danger"
        onConfirm={documents.handleDeleteConfirm}
        onCancel={documents.closeDelete}
      />
    </div>
  );
}
