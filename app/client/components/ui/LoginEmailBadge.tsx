import StatusBadge from "@/components/ui/StatusBadge";
import type { AccountEmailStatus } from "@/lib/api/credentialsEmail";

/**
 * Whether an account's login was emailed to it: "Sent" with the date, "Failed"
 * (hover for why), or "Not sent" — mail switched off, or an account that
 * predates login emails. Never anything about the password itself.
 */
export default function LoginEmailBadge({
  account,
}: {
  account: AccountEmailStatus;
}) {
  if (account.credentialsEmailStatus === "SENT") {
    return (
      <div>
        <StatusBadge label="Sent" variant="approved" />
        {account.credentialsSentAt && (
          <div className="text-xs text-gray-500 mt-0.5">
            {new Date(account.credentialsSentAt).toLocaleDateString()}
          </div>
        )}
      </div>
    );
  }
  if (account.credentialsEmailStatus === "FAILED") {
    return (
      <span title={account.credentialsEmailError ?? undefined}>
        <StatusBadge label="Failed" variant="declined" />
      </span>
    );
  }
  return (
    <span title={account.credentialsEmailError ?? undefined}>
      <StatusBadge label="Not sent" variant="neutral" />
    </span>
  );
}
