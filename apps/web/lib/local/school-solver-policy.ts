import type { SolverPolicy } from "@/lib/domain/contracts";

/**
 * FZŠ Chodovická 2026/2027 policy that reproduces the accepted V8 timetable rules.
 *
 * This is intentionally a preset outside the generic solver. A different school
 * can provide a different SolverPolicy while reusing exactly the same engine.
 */
export const CURRENT_SCHOOL_SOLVER_POLICY: SolverPolicy = {
  version: "1",
  forbidden_subject_windows: [
    {
      subject_codes: [
        "CJ",
        "M",
        "FY",
        "CH",
        "JAZ1",
        "JAZ2",
        "PRI",
        "DEJ",
        "ZEM",
        "OV",
        "PKCJ",
        "PRPK",
      ],
      periods: [6, 7],
    },
    {
      subject_codes: ["TV"],
      periods: [0, 1, 2, 3, 4, 5, 6, 7],
      days: [0],
    },
  ],
  subject_daily_limits: [
    {
      subject_codes: ["CJ", "M", "PRI", "DEJ", "ZEM", "JAZ1", "JAZ2", "CH"],
      max_periods_per_day: 1,
    },
  ],
  class_day: {
    require_first_period: true,
    allowed_afternoon_patterns: [
      [0, 1, 2, 3, 5, 6],
      [0, 1, 2, 3, 4, 6, 7],
    ],
    // The accepted V8 has no Monday afternoon. Friday also ends after period 6.
    latest_period_by_day: [5, 7, 7, 7, 5],
  },
  teacher_afternoon_break: {
    enabled: true,
    afternoon_start_period: 6,
    break_periods: [3, 4, 5],
    minimum_free_periods: 1,
  },
  quality: {
    // This high priority is also interpreted by the policy adapter as a hard
    // max-one-lesson daily spread for regular full-week classes.
    class_daily_balance_weight: 20_000,
    class_afternoon_weight: 4_000,
    afternoon_day_weights: [0, 0, 0, 0, 0],
    subject_late_weights: {
      INF: 1_500,
      VZ: 250,
      VKZ: 250,
      HV: 0,
      TV: 0,
      VV: 0,
      PC: 0,
      SVS: 0,
    },
    subject_afternoon_bonuses: {
      TV: 4_000,
      PC: 2_500,
      VV: 2_500,
      SVS: 2_000,
      VZ: 1_500,
      VKZ: 1_500,
      HV: 500,
    },
  },
};
