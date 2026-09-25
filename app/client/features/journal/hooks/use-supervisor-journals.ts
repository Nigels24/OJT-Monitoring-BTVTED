import { useState } from "react";
import {
  useGetSupervisorJournalsQuery,
  useGetSupervisorJournalEntryQuery,
  type JournalListRow,
} from "@/lib/api/journalApi";
import { useGetSupervisorStudentsQuery } from "@/lib/api/supervisorApi";

/**
 * The supervisor's read-only view of their trainees' journals.
 *
 * Deliberately has no review actions: the coordinator accepts or returns an
 * entry, the supervisor reads what the trainee wrote about the days they
 * witnessed (Table 1). The student picker is populated from the same roster the
 * attendance and evaluation screens use, so "per trainee" means the same set of
 * people everywhere.
 */
export function useSupervisorJournals() {
  const [studentId, setStudentId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: students } = useGetSupervisorStudentsQuery();
  const { data: rows, isLoading, isError } = useGetSupervisorJournalsQuery({
    studentId,
    from,
    to,
  });
  const { data: detail, isFetching: isDetailLoading } =
    useGetSupervisorJournalEntryQuery(detailId ?? "", { skip: !detailId });

  const studentOptions = [
    { label: "All trainees", value: "" },
    ...(students ?? []).map((student) => ({
      label: `${student.user.name} · ${student.studentIdNumber}`,
      value: student.id,
    })),
  ];

  return {
    rows: rows ?? [],
    isLoading,
    isError,
    studentId,
    studentOptions,
    from,
    to,

    detail: detailId && detail?.id === detailId ? detail : null,
    isDetailOpen: detailId !== null,
    isDetailLoading,

    setStudentId,
    setFrom,
    setTo,
    openDetail: (row: JournalListRow) => setDetailId(row.id),
    closeDetail: () => setDetailId(null),
  };
}
