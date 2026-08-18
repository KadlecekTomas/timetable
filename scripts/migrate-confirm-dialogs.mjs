import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(content, before, after, label) {
  if (!content.includes(before)) {
    throw new Error(`Expected source not found: ${label}`);
  }
  return content.replace(before, after);
}

async function update(path, transform) {
  const source = await readFile(path, "utf8");
  const next = transform(source);
  if (next === source) throw new Error(`No changes produced for ${path}`);
  await writeFile(path, next, "utf8");
}

const importAnchor = 'import { Button } from "@/components/ui/button";';
const importWithConfirm = `${importAnchor}\nimport { confirmAction } from "@/components/ui/confirm-action-dialog";`;

await update("apps/web/app/coverage/page.tsx", (source) => {
  let next = replaceOnce(
    source,
    importAnchor,
    importWithConfirm,
    "coverage confirmAction import",
  );
  next = replaceOnce(
    next,
    `      if (\n        staffingPlan.teachers.length > 0 &&\n        !window.confirm(\n          "Nahradit současný seznam učitelů a úvazků tímto Excelem?",\n        )\n      ) {\n        return;\n      }`,
    `      if (staffingPlan.teachers.length > 0) {\n        const confirmed = await confirmAction(\n          "Současný seznam učitelů a úvazků bude nahrazen daty z tohoto Excelu.",\n          {\n            title: "Nahradit učitele a úvazky?",\n            confirmLabel: "Nahradit data",\n            tone: "danger",\n          },\n        );\n        if (!confirmed) return;\n      }`,
    "coverage workbook confirmation",
  );
  return next;
});

await update("apps/web/app/staffing/page.tsx", (source) => {
  let next = replaceOnce(
    source,
    importAnchor,
    importWithConfirm,
    "staffing confirmAction import",
  );
  next = replaceOnce(
    next,
    `    const handleDocumentClick = (event: MouseEvent) => {`,
    `    const handleDocumentClick = async (event: MouseEvent) => {`,
    "staffing async navigation handler",
  );
  next = replaceOnce(
    next,
    `      if (!window.confirm(unsavedNavigationMessage)) {\n        event.preventDefault();\n        event.stopPropagation();\n        return;\n      }\n      allowNavigationRef.current = true;\n      window.setTimeout(() => {\n        allowNavigationRef.current = false;\n      }, 0);`,
    `      event.preventDefault();\n      event.stopPropagation();\n      const confirmed = await confirmAction(unsavedNavigationMessage, {\n        title: "Opustit stránku bez uložení?",\n        confirmLabel: "Opustit stránku",\n        tone: "danger",\n      });\n      if (!confirmed) return;\n      allowNavigationRef.current = true;\n      anchor.click();\n      window.setTimeout(() => {\n        allowNavigationRef.current = false;\n      }, 0);`,
    "staffing unsaved navigation confirmation",
  );
  next = replaceOnce(
    next,
    `  function removeTeacher(teacher: StaffingTeacher): void {\n    if (\n      !window.confirm(\n        \`Opravdu odstranit \${teacher.firstName || "tohoto učitele"} \${teacher.lastName}?\`,\n      )\n    ) {\n      return;\n    }`,
    `  async function removeTeacher(teacher: StaffingTeacher): Promise<void> {\n    const confirmed = await confirmAction(\n      \`Odstranit \${teacher.firstName || "tohoto učitele"} \${teacher.lastName}?\`,\n      {\n        title: "Odstranit učitele?",\n        confirmLabel: "Odstranit učitele",\n        tone: "danger",\n      },\n    );\n    if (!confirmed) return;`,
    "staffing remove teacher confirmation",
  );
  next = replaceOnce(
    next,
    `      if (\n        plan.teachers.length > 0 &&\n        !window.confirm(\n          "Nahradit aktuálně rozepsané učitele obsahem tohoto Excelu? Neuložené změny se zahodí.",\n        )\n      ) {\n        return;\n      }`,
    `      if (plan.teachers.length > 0) {\n        const confirmed = await confirmAction(\n          "Aktuálně rozepsaní učitelé budou nahrazeni obsahem tohoto Excelu. Neuložené změny se zahodí.",\n          {\n            title: "Nahradit rozepsané učitele?",\n            confirmLabel: "Nahradit učitele",\n            tone: "danger",\n          },\n        );\n        if (!confirmed) return;\n      }`,
    "staffing workbook confirmation",
  );
  return next;
});

await update("apps/web/app/teaching-plan/page.tsx", (source) => {
  let next = replaceOnce(
    source,
    importAnchor,
    importWithConfirm,
    "teaching-plan confirmAction import",
  );
  next = replaceOnce(
    next,
    `  function removeClass(code: string): void {\n    if (\n      !window.confirm(\`Odstranit třídu \${code} včetně všech jejích předmětů?\`)\n    ) {\n      return;\n    }`,
    `  async function removeClass(code: string): Promise<void> {\n    const confirmed = await confirmAction(\n      \`Odstranit třídu \${code} včetně všech jejích předmětů?\`,\n      {\n        title: "Odstranit třídu?",\n        confirmLabel: "Odstranit třídu",\n        tone: "danger",\n      },\n    );\n    if (!confirmed) return;`,
    "teaching-plan remove class confirmation",
  );
  next = replaceOnce(
    next,
    `      if (\n        assignmentsResponse.items.length > 0 &&\n        !window.confirm(\n          \`Projekt už obsahuje \${assignmentsResponse.items.length} výukových vazeb. Nahradit je tímto zkontrolovaným plánem?\`,\n        )\n      ) {\n        return;\n      }`,
    `      if (assignmentsResponse.items.length > 0) {\n        const confirmed = await confirmAction(\n          \`Projekt už obsahuje \${assignmentsResponse.items.length} výukových vazeb. Nový zkontrolovaný plán je nahradí.\`,\n          {\n            title: "Nahradit výukové vazby?",\n            confirmLabel: "Nahradit vazby",\n            tone: "danger",\n          },\n        );\n        if (!confirmed) return;\n      }`,
    "teaching-plan assignment replacement confirmation",
  );
  next = replaceOnce(
    next,
    `            onClick={() => {\n              if (\n                !window.confirm(\n                  \`Použít \${rotationProposal.candidates.length} navržených rotací ČJ / M?\`,\n                )\n              )\n                return;\n              commit(rotationProposal.plan);`,
    `            onClick={async () => {\n              const confirmed = await confirmAction(\n                \`Použít \${rotationProposal.candidates.length} navržených rotací ČJ / M?\`,\n                {\n                  title: "Použít navržené rotace?",\n                  confirmLabel: "Použít rotace",\n                },\n              );\n              if (!confirmed) return;\n              commit(rotationProposal.plan);`,
    "teaching-plan rotation confirmation",
  );
  return next;
});
