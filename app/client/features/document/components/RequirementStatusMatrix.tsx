import { Globe, Users } from "lucide-react";
import SelectField from "@/components/ui/SelectField";
import {
  DOCUMENT_STAGE_LABEL,
  type DocumentRequirement,
  type DocumentStage,
} from "@/lib/api/studentPortalApi";
import type {
  RequirementCell,
  RequirementStatusRow,
} from "@/lib/api/documentApi";
import {
  REQUIREMENT_STATE_CELL,
  REQUIREMENT_STATE_LABEL,
  REQUIREMENT_STATE_SHORT,
} from "./requirement-state";

interface RequirementStatusMatrixProps {
  requirements: DocumentRequirement[];
  stages: DocumentStage[];
  rows: RequirementStatusRow[];
  isLoading: boolean;
  isError: boolean;
  scope: "block" | "all";
  stage: DocumentStage | "";
  noBlocksAssigned: boolean;
  onScopeChange: (scope: "block" | "all") => void;
  onStageChange: (stage: DocumentStage | "") => void;
  onCellClick: (row: RequirementStatusRow, cell: RequirementCell) => void;
}

const STAGE_OPTIONS = [
  { label: "All stages", value: "" },
  { label: DOCUMENT_STAGE_LABEL.APPLICATION, value: "APPLICATION" },
  { label: DOCUMENT_STAGE_LABEL.ACCEPTANCE, value: "ACCEPTANCE" },
  { label: DOCUMENT_STAGE_LABEL.COMPLETION, value: "COMPLETION" },
];

/**
 * Students down, requirements across, grouped by stage.
 *
 * Every cell is a button: a filled one opens its document for review, a missing
 * one opens the upload dialog (the school produces the endorsement letter, MOA
 * and waiver itself). A requirement that isn't due yet — per-placement, student
 * not placed — is inert and muted rather than shown as a gap.
 */
export default function RequirementStatusMatrix({
  requirements,
  stages,
  rows,
  isLoading,
  isError,
  scope,
  stage,
  noBlocksAssigned,
  onScopeChange,
  onStageChange,
  onCellClick,
}: RequirementStatusMatrixProps) {
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1 self-start">
          <button
            type="button"
            onClick={() => onScopeChange("block")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              scope === "block"
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Users size={14} />
            My Block
          </button>
          <button
            type="button"
            onClick={() => onScopeChange("all")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              scope === "all"
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Globe size={14} />
            All Program
          </button>
        </div>
        <div className="sm:w-48">
          <SelectField
            value={stage}
            onChange={(value) => onStageChange(value as DocumentStage | "")}
            placeholder="All stages"
            options={STAGE_OPTIONS}
            className="w-full"
          />
        </div>
      </div>

      {noBlocksAssigned && scope === "block" && (
        <p className="text-xs text-amber-600 mb-3">
          You have no blocks assigned yet, so this is showing every student in the
          program.
        </p>
      )}

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : isError ? (
        <p className="text-red-600 text-sm py-8 text-center">
          Couldn&apos;t load the requirements status. Please refresh to try
          again.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">
          No students match this scope.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-y-1">
              <thead>
                <tr>
                  <th className="text-left font-semibold text-gray-700 pb-2 pr-4 whitespace-nowrap text-xs md:text-sm sticky left-0 bg-white">
                    Student
                  </th>
                  {stages.map((groupStage) => {
                    const stageRequirements = requirements.filter(
                      (requirement) => requirement.stage === groupStage,
                    );
                    return stageRequirements.map((requirement, index) => (
                      <th
                        key={requirement.id}
                        className={`pb-2 px-2 text-xs font-semibold text-gray-600 whitespace-nowrap ${
                          index === 0 ? "border-l border-gray-200" : ""
                        }`}
                        title={`${DOCUMENT_STAGE_LABEL[groupStage]} · ${requirement.name}`}
                      >
                        <span className="block text-[10px] uppercase tracking-wide text-gray-400">
                          {index === 0 ? DOCUMENT_STAGE_LABEL[groupStage] : " "}
                        </span>
                        {requirement.code}
                      </th>
                    ));
                  })}
                  <th className="pb-2 px-2 text-xs font-semibold text-gray-600 whitespace-nowrap">
                    Done
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.student.id}>
                    <td className="pr-4 py-1 sticky left-0 bg-white">
                      <div className="font-medium text-gray-900 whitespace-nowrap">
                        {row.student.name}
                      </div>
                      <div className="text-xs text-gray-500 whitespace-nowrap">
                        {row.student.studentIdNumber}
                        {row.student.block ? ` · ${row.student.block.name}` : ""}
                      </div>
                    </td>
                    {requirements.map((requirement) => {
                      const cell = row.cells.find(
                        (c) => c.requirementId === requirement.id,
                      );
                      if (!cell) return <td key={requirement.id} />;
                      const inert = cell.state === "NOT_APPLICABLE";
                      return (
                        <td key={requirement.id} className="px-1 py-1">
                          <button
                            type="button"
                            disabled={inert}
                            onClick={() => onCellClick(row, cell)}
                            title={`${row.student.name} · ${requirement.name}: ${REQUIREMENT_STATE_LABEL[cell.state]}`}
                            className={`w-full min-w-20 rounded-md px-2 py-1.5 text-[11px] font-medium ${
                              REQUIREMENT_STATE_CELL[cell.state]
                            } ${inert ? "cursor-not-allowed" : "hover:opacity-80"}`}
                          >
                            {REQUIREMENT_STATE_SHORT[cell.state]}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-xs text-gray-600 whitespace-nowrap">
                      {row.approvedCount}/{row.applicableCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-gray-500">
            {(
              [
                "MISSING",
                "PENDING",
                "APPROVED",
                "DECLINED",
                "NOT_APPLICABLE",
              ] as const
            ).map((state) => (
              <span key={state} className="inline-flex items-center gap-1.5">
                <span
                  className={`inline-block w-3 h-3 rounded ${REQUIREMENT_STATE_CELL[state]}`}
                />
                {REQUIREMENT_STATE_LABEL[state]}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
