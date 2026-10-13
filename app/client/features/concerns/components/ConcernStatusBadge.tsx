import StatusBadge, { BadgeVariant } from "@/components/ui/StatusBadge";
import { CONCERN_STATUS_LABEL, ConcernStatus } from "@/lib/api/concernApi";

const VARIANT: Record<ConcernStatus, BadgeVariant> = {
  OPEN: "declined",
  ACKNOWLEDGED: "pending",
  RESOLVED: "approved",
};

export default function ConcernStatusBadge({
  status,
}: {
  status: ConcernStatus;
}) {
  return (
    <StatusBadge label={CONCERN_STATUS_LABEL[status]} variant={VARIANT[status]} />
  );
}
