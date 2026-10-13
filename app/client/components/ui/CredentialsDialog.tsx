"use client";

import { useState } from "react";
import { KeyRound, X, Copy, Check, Globe } from "lucide-react";
import Button from "@/components/ui/Button";
import Overlay from "@/components/ui/Overlay";

interface CredentialsDialogProps {
  open: boolean;
  /** The account holder's display name, shown for confirmation only. */
  name: string;
  /** Username (preferred) or email — whichever the account signs in with. */
  identifier: string;
  /** Plaintext, shown once. The caller drops it from state on close. */
  temporaryPassword: string;
  /**
   * Why this is on screen rather than in the user's inbox — "Email is not
   * configured" or "Email failed: …". Omit where no email was attempted.
   */
  reason?: string;
  onClose: () => void;
}

/**
 * "Credentials to release" — the fallback for when the login email did not go
 * out. A new account's password, or a resent one, is normally emailed straight
 * to the user and never reaches this client; the server returns it only when
 * that email was not sent (mail not configured, or the send failed), so the
 * coordinator can hand it over instead. Shown once: it isn't retrievable after
 * this closes.
 */
export default function CredentialsDialog({
  open,
  name,
  identifier,
  temporaryPassword,
  reason,
  onClose,
}: CredentialsDialogProps) {
  const [copied, setCopied] = useState(false);

  const webAddress =
    typeof window !== "undefined" ? window.location.origin : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(
      `Web address: ${webAddress}\nUsername: ${identifier}\nTemporary password: ${temporaryPassword}`,
    );
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  const close = () => {
    setCopied(false);
    onClose();
  };

  if (!open) return null;

  return (
    <Overlay
      open
      label="Credentials to release"
      onClose={close}
      closeOnBackdrop={false}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <KeyRound size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Credentials to release
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
          {reason && (
            <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 break-words">
              <span className="font-semibold">Not emailed.</span> {reason}
            </p>
          )}
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Give this to <strong>{name}</strong> now — it won&apos;t be shown
            again. They&apos;ll be asked to set their own password the first
            time they sign in.
          </p>

          <dl className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500 flex items-center gap-1.5">
                <Globe size={14} />
                Web address
              </dt>
              <dd className="font-mono text-gray-900 break-all text-right">
                {webAddress}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">Username</dt>
              <dd className="font-mono text-gray-900 break-all text-right">
                {identifier}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-500">Temporary password</dt>
              <dd className="font-mono font-semibold text-gray-900 break-all text-right">
                {temporaryPassword}
              </dd>
            </div>
          </dl>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              icon={copied ? Check : Copy}
              variant="secondary"
              onClick={handleCopy}
            >
              {copied ? "Copied" : "Copy login details"}
            </Button>
            <Button type="button" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
