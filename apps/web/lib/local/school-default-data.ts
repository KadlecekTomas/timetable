import type {
  SchoolCurriculum,
  SchoolCurriculumSubject,
} from "./school-curriculum";

export const SCHOOL_SPLIT_SUBJECT_CODES = new Set([
  "CJ",
  "M",
  "INF",
  "TV",
  "JAZ1",
  "JAZ2",
]);

const REGULAR_SUBJECTS: SchoolCurriculumSubject[] = [
  subject("CJ", "Český jazyk", 5, 4, 4, 4),
  subject("JAZ1", "Anglický jazyk", 4, 3, 3, 4),
  subject("JAZ2", "Další cizí jazyk", 0, 0, 3, 3),
  subject("M", "Matematika", 4, 5, 4, 4),
  subject("INF", "Informatika", 1, 1, 1, 1),
  subject("DEJ", "Dějepis", 2, 2, 2, 2),
  subject("OV", "Občanská výchova", 1, 1, 1, 1),
  subject("FY", "Fyzika", 2, 2, 1, 2),
  subject("CH", "Chemie", 0, 0, 2, 2),
  subject("PRI", "Přírodopis", 2, 2, 2, 1),
  subject("ZEM", "Zeměpis", 2, 2, 1, 2),
  subject("HV", "Hudební výchova", 1, 1, 1, 0),
  subject("VV", "Výtvarná výchova", 2, 2, 1, 1),
  subject("TV", "Tělesná výchova", 2, 2, 2, 2),
  subject("VZ", "Výchova ke zdraví", 0, 1, 1, 0),
  subject("PC", "Pracovní činnosti", 1, 1, 1, 0),
  subject("VOL", "Povinně volitelné předměty", 1, 2, 1, 1),
];

const SPORTS_SUBJECTS: SchoolCurriculumSubject[] = [
  subject("CJ", "Český jazyk", 4, 4, 5, 4),
  subject("JAZ1", "Anglický jazyk", 3, 3, 3, 3),
  subject("JAZ2", "Další cizí jazyk", 0, 0, 3, 3),
  subject("M", "Matematika", 4, 4, 4, 5),
  subject("INF", "Informatika", 1, 1, 1, 1),
  subject("DEJ", "Dějepis", 2, 2, 2, 2),
  subject("OV", "Občanská výchova", 1, 1, 1, 1),
  subject("FY", "Fyzika", 2, 2, 1, 1),
  subject("CH", "Chemie", 0, 0, 2, 2),
  subject("PRI", "Přírodopis", 2, 2, 1, 1),
  subject("ZEM", "Zeměpis", 2, 2, 1, 1),
  subject("HV", "Hudební výchova", 1, 1, 1, 0),
  subject("VV", "Výtvarná výchova", 2, 2, 1, 1),
  subject("TV", "Tělesná výchova", 5, 5, 5, 4),
  subject("VZ", "Výchova ke zdraví", 0, 0, 0, 0),
  subject("PC", "Pracovní činnosti", 1, 1, 1, 0),
  subject("VOL", "Povinně volitelné předměty", 0, 0, 0, 1),
];

function subject(
  subjectCode: string,
  subjectName: string,
  grade6: number,
  grade7: number,
  grade8: number,
  grade9: number,
): SchoolCurriculumSubject {
  return {
    subjectCode,
    subjectName,
    weeklyPeriodsByGrade: {
      "6": grade6,
      "7": grade7,
      "8": grade8,
      "9": grade9,
    },
  };
}

export const DEFAULT_SCHOOL_CURRICULUM: SchoolCurriculum = {
  version: 1,
  profiles: {
    REGULAR: {
      profile: "REGULAR",
      sourceSheet: "UČEBNÍ PLÁN – BĚŽNÉ TŘÍDY",
      subjects: REGULAR_SUBJECTS,
    },
    SPORTS: {
      profile: "SPORTS",
      sourceSheet: "UČEBNÍ PLÁN – TŘÍDY S ROZŠÍŘENOU VÝUKOU TV",
      subjects: SPORTS_SUBJECTS,
    },
  },
};

export function createDefaultSchoolCurriculum(): SchoolCurriculum {
  return structuredClone(DEFAULT_SCHOOL_CURRICULUM);
}
