import { TriangleAlert } from "lucide-react";
import { useGetConcernsQuery } from "@/lib/api/concernApi";
import ConcernCard from "./ConcernCard";

interface PlacementConcernsProps {
  assignmentId: string;
}

/**
 * The concern history of one placement, inside the Student Details dialog.
 * Read-only here — responding happens on the Concerns page. Nothing renders
 * for a placement with no concerns, which is nearly all of them.
 */
export default function PlacementConcerns({
  assignmentId,
}: PlacementConcernsProps) {
  const { data } = useGetConcernsQuery({ assignmentId });
  const concerns = data?.concerns ?? [];
  if (concerns.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-2">
        <TriangleAlert size={15} className="text-blue-600" />
        Concerns ({concerns.length})
      </h4>
      <ul className="space-y-2">
        {concerns.map((concern) => (
          <ConcernCard key={concern.id} concern={concern} showTrainee={false} />
        ))}
      </ul>
    </div>
  );
}
