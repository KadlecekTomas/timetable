import type ExcelJS from "exceljs";

import {
  CLIENT_TEMPLATE_FIRST_DATA_ROW,
  CLIENT_TEMPLATE_LAST_DATA_ROW,
  CLIENT_TEMPLATE_SHEET_NAMES,
} from "./client-workbook";

/**
 * Skutečný katalog předmětů používaný školou v aktuálních rozvrzích.
 *
 * Interní kódy zůstávají stabilní kvůli existujícím vazbám a importům.
 * Uživatelské názvy ale odpovídají školním zkratkám ČJ/ČJL, Aj, 2.Nj,
 * Př, D, F, Z, Ch, Ov, Vkz, Pč atd. Tři školní zkratky Svs, PkČj a
 * PřPk ponecháváme bez domyšleného rozvedení, dokud škola nedodá jejich
 * přesné oficiální názvy.
 */
export const CURRENT_SCHOOL_SUBJECT_ROWS = [
  ["CJ", "Český jazyk a literatura (ČJ / ČJL)", ""],
  ["M", "Matematika (M)", ""],
  ["JAZ1", "Anglický jazyk (Aj)", "JAZYKOVÁ UČEBNA"],
  ["JAZ2", "Druhý cizí jazyk – německý jazyk (2.Nj)", "JAZYKOVÁ UČEBNA"],
  ["INF", "Informatika (Inf)", "POČÍTAČOVÁ UČEBNA"],
  ["TV", "Tělesná výchova (Tv)", "TĚLOCVIČNA"],
  ["FY", "Fyzika (F)", ""],
  ["DEJ", "Dějepis (D)", ""],
  ["ZEM", "Zeměpis (Z)", ""],
  ["PRI", "Přírodopis (Př)", ""],
  ["CH", "Chemie (Ch)", ""],
  ["OV", "Občanská výchova (Ov)", ""],
  ["VZ", "Výchova ke zdraví (Vkz)", ""],
  ["HV", "Hudební výchova (Hv)", ""],
  ["VV", "Výtvarná výchova (Vv)", ""],
  ["PC", "Pracovní činnosti (Pč)", ""],
  ["SVS", "Svs", ""],
  ["PKCJ", "PkČj", ""],
  ["PRPK", "PřPk", ""],
] as const;

function clearSubjectRows(worksheet: ExcelJS.Worksheet) {
  for (
    let rowNumber = CLIENT_TEMPLATE_FIRST_DATA_ROW;
    rowNumber <= CLIENT_TEMPLATE_LAST_DATA_ROW;
    rowNumber += 1
  ) {
    for (let column = 1; column <= 3; column += 1) {
      worksheet.getCell(rowNumber, column).value = null;
    }
  }
}

export function applyCurrentSchoolSubjectCatalog(workbook: ExcelJS.Workbook) {
  const subjects = workbook.getWorksheet(CLIENT_TEMPLATE_SHEET_NAMES.subjects);
  if (!subjects) {
    throw new Error("Školní šablona nemá list 3. Předměty.");
  }

  clearSubjectRows(subjects);
  CURRENT_SCHOOL_SUBJECT_ROWS.forEach((values, rowIndex) => {
    values.forEach((value, columnIndex) => {
      subjects.getCell(
        CLIENT_TEMPLATE_FIRST_DATA_ROW + rowIndex,
        columnIndex + 1,
      ).value = value;
    });
  });

  subjects.getCell("A2").value =
    "Předvyplněno podle předmětů skutečně používaných v aktuálních školních rozvrzích. Svs, PkČj a PřPk jsou ponechány jako školní zkratky; jejich plné názvy doplňte podle ŠVP. Akce, výlety a suplování nejsou předměty.";
  subjects.getRow(2).height = 58;
}
