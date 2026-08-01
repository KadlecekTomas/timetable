import type ExcelJS from "exceljs";

import { CLIENT_TEMPLATE_SHEET_NAMES } from "./client-workbook";

/**
 * Aplikuje personální pravidla konkrétní školy nad obecnou šablonou.
 *
 * Informatika je předvyplněná ve dvou souběžných skupinách, které mohou
 * vést KAD a VAS. Jedinou výjimkou je malá třída 8.B, která se na INF
 * nedělí a zůstává jako jedna celotřídní vazba.
 */
export function applySchoolStaffingOverrides(workbook: ExcelJS.Workbook) {
  const guide = workbook.getWorksheet(CLIENT_TEMPLATE_SHEET_NAMES.guide);
  const assignments = workbook.getWorksheet(
    CLIENT_TEMPLATE_SHEET_NAMES.assignments,
  );
  const organization = workbook.getWorksheet("8. Organizační pravidla");

  if (!guide || !assignments || !organization) {
    throw new Error("Školní šablona nemá očekávané informační listy.");
  }

  assignments.getCell("A2").value =
    "Předpřipravené řádky rozdělí češtinu, matematiku, informatiku a cizí jazyky na dvě poloviny. Informatika v 8.B zůstává pro celou třídu. Doplňte učitele a hodinovou dotaci; nepotřebné řádky smažte.";
  assignments.getRow(2).height = 62;

  guide.getCell("B33").value =
    "Na listu 5. Kdo co učí jsou připravené dvě poloviny pro český jazyk, matematiku, informatiku a dva cizí jazyky. Výjimkou je 8.B, která se na informatiku kvůli nízkému počtu žáků nedělí.";

  organization.getCell("B6").value = "Všechny třídy kromě 8.B";
  organization.getCell("C6").value = "Skupina 1: KAD, skupina 2: VAS";
  organization.getCell("D6").value = "8.B se učí jako celá třída";
  organization.getCell("E6").value =
    "8.B se kvůli nízkému počtu žáků na informatiku nedělí.";

  organization.getCell("B7").value = "Pouze informatika, 12 hodin týdně";
  organization.getCell("C7").value = "Učí pouze v úterý a ve středu";
  organization.getCell("D7").value =
    "Pondělí, čtvrtek a pátek jsou nedostupné";
  organization.getCell("E7").value =
    "Nedostupné sloty nastavte na listu 6. Dostupnost.";
}
