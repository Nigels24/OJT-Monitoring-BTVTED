import Link from "next/link";
import { Award, Printer } from "lucide-react";
import Card from "@/components/ui/Card";
import { StudentDashboard } from "@/lib/api/studentPortalApi";
import { formatGrade } from "@/lib/format";

interface AssessmentCardProps {
  assessment: StudentDashboard["assessment"];
}

/**
 * The student's two-part assessment: the supervisor's evaluation sheets, and
 * the coordinator's grade for the OJT portfolio report and its presentation.
 *
 * Shown as two separate figures because they are — the sheet is a raw total
 * out of its own maximum, the grade is 0-100, and nothing combines them.
 */
export default function AssessmentCard({ assessment }: AssessmentCardProps) {
  const { grades, evaluations } = assessment;

  return (
    <Card className="mb-4">
      <h2 className="text-base md:text-lg font-semibold text-gray-800 mb-1 flex items-center gap-2">
        <Award size={18} className="text-blue-600" />
        Assessment
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Two parts: your supervisor&apos;s evaluation sheet, and your OJT
        coordinator&apos;s grade for your portfolio report and its
        presentation.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">
            Supervisor&apos;s evaluation sheet
          </h3>
          {evaluations.length === 0 ? (
            <p className="text-sm text-gray-500">
              Your supervisor has not submitted an evaluation sheet yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {evaluations.map((evaluation) => (
                <li
                  key={evaluation.id}
                  className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-gray-900 tabular-nums">
                      {evaluation.totalRating}
                      <span className="text-sm font-normal text-gray-500">
                        {" "}
                        / {evaluation.maxTotalRating}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 break-words">
                      {[
                        evaluation.trainingEmployedAt,
                        evaluation.evaluatorName
                          ? `by ${evaluation.evaluatorName}`
                          : null,
                        new Date(evaluation.createdAt).toLocaleDateString(),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Link
                    href={`/student/evaluations/${evaluation.id}/print`}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                  >
                    <Printer size={14} />
                    View / print
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">
            Coordinator&apos;s grade
          </h3>
          {grades.length === 0 ? (
            <p className="text-sm text-gray-500">
              Not graded yet. Your coordinator records this once your placement
              has ended or your required hours are complete.
            </p>
          ) : (
            <ul className="space-y-2">
              {grades.map((grade) => (
                <li key={grade.id} className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-lg font-bold text-gray-900 tabular-nums">
                    {formatGrade(grade.coordinatorGrade)}
                    <span className="text-sm font-normal text-gray-500">
                      {" "}
                      / 100
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 break-words">
                    {[
                      grade.establishment.name,
                      grade.academicYear,
                      grade.gradedBy
                        ? `by ${grade.gradedBy.user.name}`
                        : null,
                      grade.gradedAt
                        ? new Date(grade.gradedAt).toLocaleDateString()
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {grade.coordinatorGradeRemarks && (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2">
                      {grade.coordinatorGradeRemarks}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
