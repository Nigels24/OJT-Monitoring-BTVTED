import { TriangleAlert } from "lucide-react";
import Card from "@/components/ui/Card";
import { useGetMyConcernsQuery } from "@/lib/api/concernApi";
import ConcernCard from "./ConcernCard";

/**
 * The supervisor's own concerns, newest first, each with the coordinator's
 * status and response. Only the ones this supervisor raised — the server
 * filters by authorship.
 */
export default function MyConcernsCard() {
  const { data: concerns, isLoading, isError } = useGetMyConcernsQuery();

  return (
    <Card className="mb-4">
      <h2 className="text-base md:text-lg font-semibold text-gray-800 mb-1 flex items-center gap-2">
        <TriangleAlert size={18} className="text-blue-600" />
        Concerns You Raised
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Raise one from a trainee&apos;s row below, or from their placement
        thread in Messages. Concerns are kept on the placement record.
      </p>
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : isError ? (
        <p role="alert" className="text-sm text-red-600">
          Could not load your concerns.
        </p>
      ) : !concerns || concerns.length === 0 ? (
        <p className="text-sm text-gray-500">
          You have not raised any concerns.
        </p>
      ) : (
        <ul className="space-y-3">
          {concerns.map((concern) => (
            <ConcernCard
              key={concern.id}
              concern={concern}
              showRaisedBy={false}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
