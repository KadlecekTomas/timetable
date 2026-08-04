from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch marker: {label}")
    return text.replace(old, new, 1)


staffing_path = Path("apps/web/app/staffing/page.tsx")
staffing = staffing_path.read_text()

staffing = replace_once(
    staffing,
    '''function nextVersion(
  payload: { schoolYearVersion?: number },
  fallback: number,
): number {
  return payload.schoolYearVersion ?? fallback + 1;
}
''',
    '''function nextVersion(
  payload: { schoolYearVersion?: number },
  fallback: number,
): number {
  return payload.schoolYearVersion ?? fallback + 1;
}

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
''',
    "staffing saved time helper",
)

staffing = replace_once(
    staffing,
    '''  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setPlan(loadStaffingPlan());
    setLoaded(true);
  }, []);
''',
    '''  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadStaffingPlan();
    setPlan(stored);
    setLastSavedAt(stored.updatedAt);
    setLoaded(true);
  }, []);
''',
    "staffing load state",
)

staffing = replace_once(
    staffing,
    '''  function commit(next: StaffingPlan): void {
    const saved = saveStaffingPlan(next);
    setPlan(saved);
    setMessage(null);
  }
''',
    '''  function commit(next: StaffingPlan): void {
    try {
      const saved = saveStaffingPlan(next);
      setPlan(saved);
      setLastSavedAt(saved.updatedAt);
      setMessage(null);
      setError((current) =>
        current?.startsWith("Automatické ukládání") ? null : current,
      );
    } catch (cause) {
      setPlan(next);
      setError(
        cause instanceof Error
          ? `Automatické ukládání selhalo: ${cause.message}`
          : "Automatické ukládání selhalo. Změny zůstaly otevřené na stránce.",
      );
    }
  }
''',
    "staffing commit",
)

staffing = replace_once(
    staffing,
    '''        `Načteno ${result.summary.teachers} učitelů. Zkontrolujte karty a poté je uložte do projektu.`,
''',
    '''        `Načteno ${result.summary.teachers} učitelů. Zkontrolujte karty; všechny změny se ukládají automaticky.`,
''',
    "staffing import message",
)

staffing = replace_once(
    staffing,
    '''      />

      <section className="grid gap-3 md:grid-cols-3">
''',
    '''      />

      <section
        data-testid="staffing-autosave-status"
        aria-live="polite"
        className="flex items-start gap-3 rounded-xl border border-success-border bg-success-subtle p-4"
      >
        <CheckCircle2
          className="mt-0.5 size-5 shrink-0 text-success"
          aria-hidden="true"
        />
        <div>
          <h2 className="font-semibold text-text-primary">
            Automaticky uloženo v tomto prohlížeči
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            Každá úprava se uloží okamžitě. Rozpracované, neúplné i přetížené
            úvazky zůstanou zachované a můžete je opravit později. Není potřeba
            hledat potvrzovací tlačítko
            {formatSavedTime(lastSavedAt)
              ? ` · poslední změna ${formatSavedTime(lastSavedAt)}`
              : ""}
            .
          </p>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
''',
    "staffing autosave banner",
)

staffing = replace_once(
    staffing,
    '''              Změny se průběžně ukládají jako místní koncept v tomto prohlížeči.
''',
    '''              Každá změna se automaticky uloží jako místní koncept. I nehotová karta zůstane po obnovení stránky zachovaná.
''',
    "staffing autosave copy",
)

staffing_path.write_text(staffing)

settings_path = Path("apps/web/app/settings/page.tsx")
settings = settings_path.read_text()

settings = replace_once(
    settings,
    '''  HardDrive,
  Save,
  Trash2,
''',
    '''  HardDrive,
  Save,
  Share2,
  Trash2,
''',
    "settings share icon",
)

settings = replace_once(
    settings,
    '''import {
  exportLocalBackup,
  getLocalProject,
  importLocalBackup,
  resetLocalProject,
  subscribeLocalProject,
  updateLocalProjectSettings,
  type LocalProject,
} from "@/lib/local/api";
''',
    '''import {
  getLocalProject,
  resetLocalProject,
  subscribeLocalProject,
  updateLocalProjectSettings,
  type LocalProject,
} from "@/lib/local/api";
import {
  applyBrowserProjectShare,
  browserProjectShareBlob,
  captureBrowserProjectShare,
  readBrowserProjectShareFile,
} from "@/lib/local/project-share";
''',
    "settings share imports",
)

settings = replace_once(
    settings,
    '''      const blob = await exportLocalBackup();
      const school = safeFilePart(project.schoolName) || "skola";
      const year = project.label.replace("/", "-");
      downloadBlob(blob, `rozvrhar-${school}-${year}.rozvrhar.json`);
''',
    '''      const envelope = await captureBrowserProjectShare();
      const school = safeFilePart(project.schoolName) || "skola";
      const year = project.label.replace("/", "-");
      downloadBlob(
        browserProjectShareBlob(envelope),
        `rozvrhar-${school}-${year}.rozvrhar.json`,
      );
''',
    "settings full backup",
)

settings = replace_once(
    settings,
    '''      const restored = await importLocalBackup(file);
      setProject(restored);
      setMessage("Projekt byl úspěšně obnoven z ověřené zálohy.");
''',
    '''      const envelope = await readBrowserProjectShareFile(file);
      await applyBrowserProjectShare(envelope);
      const restored = await getLocalProject();
      setProject(restored);
      setMessage(
        "Projekt byl úspěšně obnoven včetně pracovních úvazků a učebního plánu.",
      );
''',
    "settings full restore",
)

settings = replace_once(
    settings,
    '''        description="Data jsou uložena pouze v IndexedDB tohoto prohlížeče. Nevzniká žádný účet ani placená serverová databáze."
''',
    '''        description="Data jsou uložena pouze v tomto prohlížeči. Nevzniká žádný účet ani placená serverová databáze."
''',
    "settings storage description",
)

settings = replace_once(
    settings,
    '''      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-text-primary">
          Volitelné školní vybavení
''',
    '''      <section className="rounded-xl border border-primary/30 bg-primary-subtle p-5">
        <div className="flex items-start gap-3">
          <Share2 className="mt-0.5 size-5 text-primary" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-text-primary">
              Sdílet projekt bez databáze
            </h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Vytvořte odkaz nebo soubor, který kolegyně otevře na jiném
              počítači. Projekt se neukládá na Vercel ani do serverové databáze.
            </p>
            <Button asChild className="mt-4">
              <Link
                href={`/share?schoolYearId=${encodeURIComponent(schoolYearId)}`}
              >
                Sdílet nebo převzít projekt
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-text-primary">
          Volitelné školní vybavení
''',
    "settings share card",
)

settings = replace_once(
    settings,
    '''            Záloha obsahuje vstupní data, importy, vytvořené rozvrhy, zámky i
            historii vrácení změn. Soubor má kontrolní součet a poškozenou
            zálohu aplikace odmítne.
''',
    '''            Záloha obsahuje pracovní úvazky, učební plán, importy,
            připravená solverová data, vytvořené rozvrhy, zámky i historii
            vrácení změn. Soubor má kontrolní součet a poškozenou zálohu
            aplikace odmítne.
''',
    "settings backup copy",
)

settings_path.write_text(settings)

spec_path = Path("apps/web/e2e/staffing.spec.ts")
spec = spec_path.read_text()

if "invalid staffing draft is automatically saved without confirmation" not in spec:
    spec += r'''

test("invalid staffing draft is automatically saved without confirmation", async ({
  page,
}) => {
  await page.goto("/staffing?schoolYearId=local-school-year");
  await page.getByRole("button", { name: "Přidat učitele ručně" }).click();
  await page.getByLabel("Jméno").fill("Testovací");
  await page.getByLabel("Příjmení").fill("Učitelka");
  await page.getByLabel("Úvazek týdně").fill("25");
  await page.locator('select[aria-label="Předmět"]').selectOption("M");
  await page.locator('input[aria-label="Počet hodin předmětu"]').fill("22");

  await expect(page.getByTestId("staffing-autosave-status")).toContainText(
    "Automaticky uloženo",
  );
  await expect(
    page.getByText(/Úvazek musí být celé číslo od 0 do 22 hodin/),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Jméno")).toHaveValue("Testovací");
  await expect(page.getByLabel("Příjmení")).toHaveValue("Učitelka");
  await expect(page.getByLabel("Úvazek týdně")).toHaveValue("25");
  await expect(
    page.locator('input[aria-label="Počet hodin předmětu"]'),
  ).toHaveValue("22");
});
'''

spec_path.write_text(spec)
