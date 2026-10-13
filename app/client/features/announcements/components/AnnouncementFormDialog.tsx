import { Megaphone, PencilLine } from "lucide-react";
import FormDialog from "@/components/ui/FormDialog";
import TextField from "@/components/ui/TextField";
import TextArea from "@/components/ui/TextArea";
import SelectField from "@/components/ui/SelectField";
import Button from "@/components/ui/Button";
import { ANNOUNCEMENT_AUDIENCE_LABEL } from "@/lib/api/announcementApi";
import type { AnnouncementFormValues } from "../hooks/use-announcement-admin";

interface Option {
  label: string;
  value: string;
}

interface AnnouncementFormDialogProps {
  open: boolean;
  isEditing: boolean;
  form: AnnouncementFormValues;
  error: string;
  isSaving: boolean;
  courseOptions: Option[];
  blockOptions: Option[];
  setField: (key: keyof AnnouncementFormValues) => (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

const AUDIENCE_OPTIONS = (
  Object.keys(ANNOUNCEMENT_AUDIENCE_LABEL) as Array<
    keyof typeof ANNOUNCEMENT_AUDIENCE_LABEL
  >
).map((value) => ({ value, label: ANNOUNCEMENT_AUDIENCE_LABEL[value] }));

/** Post an announcement, or edit one. Editing never notifies anyone again. */
export default function AnnouncementFormDialog({
  open,
  isEditing,
  form,
  error,
  isSaving,
  courseOptions,
  blockOptions,
  setField,
  onSubmit,
  onClose,
}: AnnouncementFormDialogProps) {
  return (
    <FormDialog
      open={open}
      title={isEditing ? "Edit Announcement" : "New Announcement"}
      subtitle={
        isEditing
          ? "Changes show immediately. Nobody is notified a second time."
          : "Everyone in the audience is notified once, when you post."
      }
      icon={Megaphone}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <TextField
          label="Title"
          labelIcon={PencilLine}
          required
          maxLength={200}
          value={form.title}
          onChange={(e) => {
            setField("title")(e.target.value);
          }}
        />
        <TextArea
          label="Message"
          labelIcon={PencilLine}
          rows={6}
          required
          maxLength={5000}
          value={form.body}
          onChange={(e) => {
            setField("body")(e.target.value);
          }}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1.5">
              Audience
            </span>
            <SelectField
              value={form.audience}
              onChange={setField("audience")}
              options={AUDIENCE_OPTIONS}
            />
          </div>
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1.5">
              Program (optional)
            </span>
            <SelectField
              value={form.courseId}
              onChange={setField("courseId")}
              options={[{ label: "All programs", value: "" }, ...courseOptions]}
            />
          </div>
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1.5">
              Block (optional)
            </span>
            <SelectField
              value={form.blockId}
              onChange={setField("blockId")}
              options={[{ label: "All blocks", value: "" }, ...blockOptions]}
            />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          A program or block narrows the audience. Supervisors are matched
          through the trainees currently placed with them.
        </p>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}

        <div className="sm:w-60">
          <Button type="submit" icon={Megaphone} loading={isSaving}>
            {isEditing ? "Save changes" : "Post announcement"}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
