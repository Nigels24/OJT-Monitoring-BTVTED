import type { DocumentStage } from '../../generated/prisma/client';

/**
 * The six required documents of thesis Table 3, as seed content only.
 *
 * `DocumentRequirement` rows are the live source of truth — every endpoint reads
 * them from the database, exactly as the evaluation sheet reads its template
 * (CLAUDE.md §9) and never from `DEFAULT_SHEET`. This list exists so
 * `prisma/seed.ts` and the `document_requirements` migration agree on the same
 * six rows, ids included; nothing at request time consults it.
 *
 * The ids are fixed literals, not cuids, for that reason: the migration's
 * `INSERT ... ON CONFLICT (code) DO NOTHING` and the seed's upsert have to
 * converge on one row per code whichever ran first.
 */
export interface DocumentRequirementSeed {
  id: string;
  code: string;
  name: string;
  stage: DocumentStage;
  sortOrder: number;
  perAssignment: boolean;
}

export const DOCUMENT_REQUIREMENT_SEED: DocumentRequirementSeed[] = [
  {
    id: 'docreq_appletter',
    code: 'APPLETTER',
    name: 'Application Letter',
    stage: 'APPLICATION',
    sortOrder: 1,
    perAssignment: false,
  },
  {
    id: 'docreq_resume',
    code: 'RESUME',
    name: 'Resume',
    stage: 'APPLICATION',
    sortOrder: 2,
    perAssignment: false,
  },
  {
    id: 'docreq_endorse',
    code: 'ENDORSE',
    name: 'Endorsement Letter',
    stage: 'ACCEPTANCE',
    sortOrder: 1,
    perAssignment: true,
  },
  {
    id: 'docreq_moa',
    code: 'MOA',
    name: 'Memorandum of Agreement',
    stage: 'ACCEPTANCE',
    sortOrder: 2,
    perAssignment: true,
  },
  {
    id: 'docreq_waiver',
    code: 'WAIVER',
    name: 'Waiver',
    stage: 'ACCEPTANCE',
    sortOrder: 3,
    perAssignment: true,
  },
  {
    id: 'docreq_portfolio',
    code: 'PORTFOLIO',
    name: 'OJT Portfolio Report',
    stage: 'COMPLETION',
    sortOrder: 1,
    perAssignment: true,
  },
];

/** Stage order for display; the enum's own order is the intended one. */
export const DOCUMENT_STAGES: DocumentStage[] = [
  'APPLICATION',
  'ACCEPTANCE',
  'COMPLETION',
];
