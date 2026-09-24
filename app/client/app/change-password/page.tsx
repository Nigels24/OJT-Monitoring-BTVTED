"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldAlert } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { useChangePasswordMutation } from "@/lib/api/authApi";
import { persistSession, ROLE_HOME, type StoredUser } from "@/lib/auth";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { SCHOOL_NAME } from "@/lib/school";

const MIN_LENGTH = 8;

/**
 * Standalone, no-Sidebar page a coordinator-issued temporary password forces
 * every account onto before it can reach anything else — `proxy.ts` redirects
 * here from every role-prefixed route while the `ojt_pwc` cookie is set, and
 * the server's global `PasswordChangeGuard` backs that up on every request
 * regardless of what the client does. There is deliberately no way to
 * navigate off this page (no Sidebar, no nav links, no Cancel) — the only way
 * out is a successful change.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [changePassword, { isLoading }] = useChangePasswordMutation();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (!/(?=.*[A-Za-z])(?=.*\d)/.test(newPassword)) {
      setError("New password must contain at least one letter and one number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The two new passwords don't match.");
      return;
    }

    try {
      const result = await changePassword({
        currentPassword,
        newPassword,
      }).unwrap();
      const user = result.user as StoredUser;
      persistSession(result.accessToken, user);
      router.push(ROLE_HOME[user.role] ?? "/login");
    } catch (err: unknown) {
      const data = (err as { data?: { message?: string | string[] } })?.data;
      setError(
        Array.isArray(data?.message)
          ? data.message.join(", ")
          : (data?.message ?? "Failed to change your password."),
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <Card className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-2">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-3">
            <ShieldAlert size={24} className="text-amber-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            Set a new password
          </h1>
          <p className="text-sm text-gray-500 mt-1">{SCHOOL_NAME}</p>
        </div>

        <p className="text-sm text-gray-600 mt-4 mb-6 text-center">
          {user?.name ? `Welcome, ${user.name}. ` : ""}
          You&apos;re signing in with a temporary password. Set your own
          before continuing.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            label="Temporary / Current Password"
            labelIcon={KeyRound}
            fieldIcon={KeyRound}
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="The password you signed in with"
          />
          <TextField
            label="New Password"
            labelIcon={KeyRound}
            fieldIcon={KeyRound}
            type="password"
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={`At least ${MIN_LENGTH} characters, with a letter and a number`}
          />
          <TextField
            label="Confirm New Password"
            labelIcon={KeyRound}
            fieldIcon={KeyRound}
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Type it again"
          />

          {error && (
            <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" icon={KeyRound} loading={isLoading}>
            Set new password
          </Button>
        </form>
      </Card>
    </div>
  );
}
