from pathlib import Path

page = Path("apps/web/app/staffing/page.tsx")
text = page.read_text()

marker = """function nextVersion(
  payload: { schoolYearVersion?: number },
  fallback: number,
): number {
  return payload.schoolYearVersion ?? fallback + 1;
}
"""
addition = marker + """
function formatSavedTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
"""
if marker in text and "function formatSavedTime" not in text:
    text = text.replace(marker, addition, 1)

state_marker = """  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
"""
state_replacement = state_marker + """  const [autoSaveStatus, setAutoSaveStatus] = useState<
    "saved" | "saving" | "error"
  >("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
"""
if state_marker in text and "autoSaveStatus" not in text:
    text = text.replace(state_marker, state_replacement, 1)

old_effect = """  useEffect(() => {
    setPlan(loadStaffingPlan());
    setLoaded(true);
  }, []);
"""
new_effect = """  useEffect(() => {
    const stored = loadStaffingPlan();
    setPlan(stored);
    setLastSavedAt(stored.updatedAt);
    setLoaded(true);
  }, []);
"""
if old_effect in text:
    text = text.replace(old_effect, new_effect, 1)

old_commit = """  function commit(next: StaffingPlan): void {
    const saved = saveStaffingPlan(next);
    setPlan(saved);
    setMessage(null);
  }
"""
new_commit = """  function commit(next: StaffingPlan): void {
    setAutoSaveStatus("saving");
    setPlan(next);
    setMessage(null);
    try {
      const saved = saveStaffingPlan(next);
      setPlan(saved);
      setLastSavedAt(saved.updatedAt);
      setAutoSaveStatus("saved");
      setError((current) =>
        current?.startsWith("Automatické ukládání") ? null : current,
      );
    } catch (cause) {
      setAutoSaveStatus("error");
      setError(
        cause instanceof Error
          ? `Automatické ukládání selhalo: ${cause.message}`
          : "Automatické ukládání selhalo. Změny zůstaly otevřené na stránce.",
      );
    }
  }
"""
if old_commit in text:
    text = text.replace(old_commit, new_commit, 1)

text = text.replace(
    "`Načteno ${result.summary.teachers} učitelů. Zkontrolujte karty a poté je uložte do projektu.`",
    "`Načteno ${result.summary.teachers} učitelů. Zkontrolujte karty; všechny změny se ukládají automaticky.`",
    1,
)

page_header_end = """      />

      <section className="grid gap-3 md:grid-cols-3">
"""
autosave = """      />

      <section
        data-testid="staffing-autosave-status"
        aria-live="polite"
        className={
          autoSaveStatus === "error"
            ? "flex items-start gap-3 rounded-xl border border-danger-border bg-danger-subtle p-4"
            : "flex items-start gap-3 rounded-xl border border-success-border bg-success-subtle p-4"
        }
      >
        {autoSaveStatus === "error" ? (
          <AlertTriangle
            className="mt-0.5 size-5 shrink-0 text-danger"
            aria-hidden="true"
          />
        ) : (
          <CheckCircle2
            className="mt-0.5 size-5 shrink-0 text-success"
            aria-hidden="true"
          />
        )}
        <div>
          <h2 className="font-semibold text-text-primary">
            {autoSaveStatus === "saving"
              ? "Automaticky ukládám změny…"
              : autoSaveStatus === "error"
                ? "Automatické uložení se nepodařilo"
                : "Automaticky uloženo"}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {autoSaveStatus === "error"
              ? "Změny zůstaly otevřené na stránce. Zkontrolujte úložiště prohlížeče a zkuste další úpravu."
              : `Každá úprava se ihned ukládá jako koncept v tomto prohlížeči${formatSavedTime(lastSavedAt) ? ` · naposledy ${formatSavedTime(lastSavedAt)}` : ""}. Nehotové nebo přetížené úvazky můžete dokončit později.`}
          </p>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
"""
if page_header_end in text and "staffing-autosave-status" not in text:
    text = text.replace(page_header_end, autosave, 1)

text = text.replace(
    "Změny se průběžně ukládají jako místní koncept v tomto prohlížeči.",
    "Každá změna se automaticky uloží jako místní koncept. Není potřeba hledat potvrzovací tlačítko.",
    1,
)
text = text.replace(
    '"Zkontrolujte červeně označené karty.")}',
    '"Zkontrolujte červeně označené karty.")} Rozpracované změny jsou už automaticky uložené.',
    1,
)
page.write_text(text)

spec = Path("apps/web/e2e/staffing.spec.ts")
test_text = spec.read_text()

heading_marker = """  await expect(
    page.getByRole("heading", { name: "Učitelé a úvazky" }),
  ).toBeVisible();
"""
heading_replacement = heading_marker + """  await expect(
    page.getByTestId("staffing-autosave-status"),
  ).toContainText("Automaticky uloženo");
"""
if heading_marker in test_text and "staffing-autosave-status" not in test_text:
    test_text = test_text.replace(heading_marker, heading_replacement, 1)

monday_marker = """  await expect(page.getByRole("button", { name: "Po nemůže" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
"""
monday_replacement = monday_marker + """
  await expect(page.getByTestId("staffing-autosave-status")).toContainText(
    "Automaticky uloženo",
  );
  await page.reload();
  await expect(page.getByLabel("Jméno")).toHaveValue("Jana");
  await expect(page.getByLabel("Příjmení")).toHaveValue("Nováková");
  await expect(page.getByLabel("Úvazek týdně")).toHaveValue("22");
  await expect(page.getByRole("button", { name: "Po nemůže" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
"""
if monday_marker in test_text and "await page.reload();" not in test_text:
    test_text = test_text.replace(monday_marker, monday_replacement, 1)

new_test = r'''

test("autosave preserves an invalid over-limit teacher draft without confirmation", async ({
  page,
}) => {
  await page.goto("/staffing?schoolYearId=local-school-year");
  await page.getByRole("button", { name: "Přidat učitele ručně" }).click();
  await page.getByLabel("Jméno").fill("Testovací");
  await page.getByLabel("Příjmení").fill("Učitelka");
  await page.getByLabel("Úvazek týdně").fill("25");
  await page.locator('select[aria-label="Předmět"]').selectOption("M");
  await page.locator('input[aria-label="Počet hodin předmětu"]').fill("22");

  await expect(page.getByText("Je potřeba opravit", { exact: true })).toBeVisible();
  await expect(page.getByText(/Úvazek musí být celé číslo od 0 do 22 hodin/)).toBeVisible();
  await expect(page.getByTestId("staffing-autosave-status")).toContainText(
    "Automaticky uloženo",
  );

  await page.reload();
  await expect(page.getByLabel("Jméno")).toHaveValue("Testovací");
  await expect(page.getByLabel("Příjmení")).toHaveValue("Učitelka");
  await expect(page.getByLabel("Úvazek týdně")).toHaveValue("25");
  await expect(page.locator('input[aria-label="Počet hodin předmětu"]')).toHaveValue(
    "22",
  );
});
'''
if "autosave preserves an invalid over-limit teacher draft" not in test_text:
    test_text += new_test
spec.write_text(test_text)
