import * as base from "./staffing-plan";

export * from "./staffing-plan";

/**
 * School planning needs two explicit pseudo-subjects:
 * - VOL keeps the curriculum envelope for compulsory electives visible.
 * - REZERVA keeps unallocated teacher capacity visible instead of turning it
 *   into a blocking import error or silently discarding it.
 */
export const STAFFING_SUBJECTS = [
  ...base.STAFFING_SUBJECTS,
  { code: "VOL", label: "Povinně volitelné předměty" },
  { code: "REZERVA", label: "Rezerva / zatím nepřiřazeno" },
] as const;
