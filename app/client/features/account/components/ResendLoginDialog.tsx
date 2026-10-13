import { useState } from "react";
import { Send, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Overlay from "@/components/ui/Overlay";
import CredentialsDialog from "@/components/ui/CredentialsDialog";
import { credentialsEmailReason } from "@/lib/api/credentialsEmail";
import {
  ResendLoginResponse,
  useResendLoginMutation,
} from "@/lib/api/userManagementApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";

/** The account to resend to — a student's or a supervisor's user row. */
export interface ResendLoginTarget {
  userId: string;
  name: string;
  email: string;
  /** What they sign in with: the username if set, otherwise the email. */
  identifier: string;
}

interface ResendLoginDialogProps {
  target: ResendLoginTarget | null;
  onClose: () => void;
}

/**
 * "Resend login" for a student or a supervisor — one dialog for both, since it
 * is the same action on the same kind of account.
 *
 * A confirm step first, because it replaces a password that may be working.
 * Then the server generates the new one and emails it: on success this closes
 * with a toast and the coordinator never sees the password. Only when the
 * email could not be sent does the one-time "Credentials to release" dialog
 * appear, with the reason, so the login can be handed over by hand.
 *
 * This replaced the two per-role "Reset password" dialogs, which generated a
 * password the same way but could only ever show it on screen.
 */
export default function ResendLoginDialog({
  target,
  onClose,
}: ResendLoginDialogProps) {
  const [error, setError] = useState("");
  const [unsent, setUnsent] = useState<ResendLoginResponse | null>(null);
  const [resendLogin, { isLoading }] = useResendLoginMutation();
  const { showSuccess } = useSnackbar();

  const close = () => {
    setError("");
    setUnsent(null);
    onClose();
  };

  const handleResend = async () => {
    if (!target) return;
    setError("");
    try {
      const result = await resendLogin(target.userId).unwrap();
      if (result.credentialsEmail.status === "SENT") {
        showSuccess(`Login sent to ${result.email}`);
        close();
      } else if (result.temporaryPassword) {
        setUnsent(result);
      } else {
        // Not sent and nothing to hand over — say so rather than sit silent.
        setError(credentialsEmailReason(result.credentialsEmail));
      }
    } catch (err: unknown) {
      const data = (err as { data?: { message?: string | string[] } })?.data;
      setError(
        Array.isArray(data?.message)
          ? data.message.join(", ")
          : (data?.message ?? "Failed to resend the login."),
      );
    }
  };

  if (!target) return null;

  if (unsent?.temporaryPassword) {
    return (
      <CredentialsDialog
        open
        name={target.name}
        identifier={unsent.username ?? unsent.email}
        temporaryPassword={unsent.temporaryPassword}
        reason={credentialsEmailReason(unsent.credentialsEmail)}
        onClose={close}
      />
    );
  }

  return (
    <Overlay open label="Resend Login" onClose={close} closeOnBackdrop={false}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Send size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Resend Login
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
            <div className="font-semibold text-gray-900">{target.name}</div>
            <div className="text-gray-600 font-mono text-xs mt-0.5 break-all">
              {target.identifier}
            </div>
          </div>

          <p className="text-sm text-gray-600">
            This will replace the current password and email a new one to{" "}
            <strong className="text-gray-900 break-words">{target.email}</strong>.
            The old password stops working straight away, and they&apos;ll be
            asked to set their own the next time they sign in.
          </p>

          {error && (
            <p
              role="alert"
              className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2"
            >
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
                icon={Send}
                loading={isLoading}
                onClick={handleResend}
              >
                Resend login
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
