import { useState } from "react";
import { KeyRound, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Overlay from "@/components/ui/Overlay";
import CredentialsDialog from "@/components/ui/CredentialsDialog";
import { Student } from "@/lib/api/studentApi";
import { useResetUserPasswordMutation } from "@/lib/api/userManagementApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";

interface ResetPasswordDialogProps {
  student: Student | null;
  onClose: () => void;
}

/**
 * Issues a new, system-generated password for a student who has forgotten
 * theirs — the coordinator no longer invents one (see the create-student
 * flow, same reasoning). A confirm step, then the same "Credentials to
 * release" dialog the create flow shows: the coordinator never sees or
 * chooses the password itself, only reads it back once to hand over.
 */
export default function ResetPasswordDialog({
  student,
  onClose,
}: ResetPasswordDialogProps) {
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ temporaryPassword: string } | null>(
    null,
  );
  const [resetPassword, { isLoading }] = useResetUserPasswordMutation();
  const { showSuccess } = useSnackbar();

  const close = () => {
    setError("");
    setResult(null);
    onClose();
  };

  const handleGenerate = async () => {
    if (!student) return;
    setError("");
    try {
      const res = await resetPassword(student.userId).unwrap();
      setResult(res);
      showSuccess(`Password reset for ${student.user.name}.`);
    } catch (err: unknown) {
      const data = (err as { data?: { message?: string | string[] } })?.data;
      setError(
        Array.isArray(data?.message)
          ? data.message.join(", ")
          : (data?.message ?? "Failed to reset the password."),
      );
    }
  };

  if (!student) return null;

  if (result) {
    return (
      <CredentialsDialog
        open
        name={student.user.name}
        identifier={student.user.username ?? student.user.email}
        temporaryPassword={result.temporaryPassword}
        onClose={close}
      />
    );
  }

  return (
    <Overlay
      open
      label="Reset Password"
      onClose={close}
      closeOnBackdrop={false}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <KeyRound size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Reset Password
            </h2>
          </div>
          <button
            onClick={close}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-4">
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm">
            <div className="font-semibold text-gray-900">
              {student.user.name}
            </div>
            <div className="text-gray-600 font-mono text-xs mt-0.5">
              {student.user.username ?? student.user.email}
            </div>
          </div>

          <p className="text-sm text-gray-600">
            This generates a new password and immediately replaces the
            student&apos;s old one. They&apos;ll be asked to set their own
            the next time they sign in.
          </p>

          {error && (
            <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              type="button"
              onClick={close}
              className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <div className="sm:w-56">
              <Button
                type="button"
                icon={KeyRound}
                loading={isLoading}
                onClick={handleGenerate}
              >
                Generate new password
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
