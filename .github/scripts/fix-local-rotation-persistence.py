from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    content = target.read_text()
    if old not in content:
        raise SystemExit(f"Expected fragment not found in {path}: {old[:160]!r}")
    target.write_text(content.replace(old, new, 1))


replace_once(
    "apps/web/lib/local/api.ts",
    '''  const classes = payload.classes.map((item) => ({
    id: idFor("class", item.class_code),
    code: item.class_code,
    grade: item.grade,
    name: item.class_name,
  }));''',
    '''  const classes = payload.classes.map((item) => ({
    id: idFor("class", item.class_code),
    code: item.class_code,
    grade: item.grade,
    name: item.class_name,
    profile: /\\.(B|D)$/i.test(item.class_code)
      ? ("SPORTS" as const)
      : ("REGULAR" as const),
  }));''',
)

replace_once(
    "apps/web/lib/local/api.ts",
    '''    maxPerDay: item.max_per_day,
    minDayGap: item.min_day_gap,
  }));''',
    '''    maxPerDay: item.max_per_day,
    minDayGap: item.min_day_gap,
    parallelKey: null,
    rotationKey: null,
    rotationLeg: null,
    rotationPlacement: null,
  }));''',
)

replace_once(
    "apps/web/lib/local/api.ts",
    '''async function deleteResource(
  resource: ResourceName,''',
    '''async function updateResource(
  resource: ResourceName,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  let response: Response | null = null;
  await mutateProject((project) => {
    response = checkExpectedVersion(project, body);
    if (response) return;

    if (resource !== "classes") {
      response = errorResponse(
        405,
        "RESOURCE_UPDATE_UNSUPPORTED",
        "Tento typ položky zatím nelze tímto způsobem upravit.",
      );
      return;
    }

    const schoolClass = project.classes.find((item) => item.id === id);
    if (!schoolClass) {
      response = errorResponse(404, "CLASS_NOT_FOUND", "Třída nebyla nalezena.");
      return;
    }
    const profile = stringField(body, "profile");
    if (!["REGULAR", "SPORTS", "CUSTOM"].includes(profile)) {
      response = errorResponse(
        422,
        "CLASS_PROFILE_INVALID",
        "Vyberte běžnou, sportovní nebo vlastní třídu.",
      );
      return;
    }

    schoolClass.profile = profile as LocalClass["profile"];
    const grade = Number(body.grade);
    if (Number.isInteger(grade) && grade >= 1 && grade <= 13) {
      schoolClass.grade = grade;
    }
    const name = stringField(body, "name");
    if (name) schoolClass.name = name;
    project.version += 1;
    response = jsonResponse({ schoolYearVersion: project.version });
  });
  return (
    response ??
    errorResponse(500, "LOCAL_UPDATE_FAILED", "Třídu se nepodařilo upravit.")
  );
}

async function deleteResource(
  resource: ResourceName,''',
)

replace_once(
    "apps/web/lib/local/api.ts",
    '''    if (method === "POST" && !id) {
      return createResource(resource, readJsonBody(init));
    }
    if (method === "DELETE" && id) {''',
    '''    if (method === "POST" && !id) {
      return createResource(resource, readJsonBody(init));
    }
    if (["PATCH", "PUT"].includes(method) && id) {
      return updateResource(resource, id, readJsonBody(init));
    }
    if (method === "DELETE" && id) {''',
)

replace_once(
    "apps/web/app/teaching-plan/page.tsx",
    '''      const existingClassCodes = new Set(
        classesResponse.items.map((item) => textValue(item, "code")),
      );
      for (const schoolClass of plan.classes) {
        if (existingClassCodes.has(schoolClass.code)) continue;
        setProgress(`Zakládám třídu ${schoolClass.code}…`);
        const payload = await requestJson<{ schoolYearVersion?: number }>(
          `/api/school-years/${schoolYearId}/classes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedSchoolYearVersion: version,
              code: schoolClass.code,
              grade: schoolClass.grade,
              name: schoolClass.code,
              profile: schoolClass.profile ?? "REGULAR",
            }),
          },
        );
        version = payload.schoolYearVersion ?? version + 1;
      }''',
    '''      const existingClassByCode = new Map(
        classesResponse.items.map((item) => [textValue(item, "code"), item]),
      );
      for (const schoolClass of plan.classes) {
        const desiredProfile = schoolClass.profile ?? "REGULAR";
        const existingClass = existingClassByCode.get(schoolClass.code);
        if (existingClass) {
          if (textValue(existingClass, "profile") !== desiredProfile) {
            setProgress(`Aktualizuji profil třídy ${schoolClass.code}…`);
            const payload = await requestJson<{ schoolYearVersion?: number }>(
              `/api/school-years/${schoolYearId}/classes/${encodeURIComponent(textValue(existingClass, "id"))}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  expectedSchoolYearVersion: version,
                  grade: schoolClass.grade,
                  name: schoolClass.code,
                  profile: desiredProfile,
                }),
              },
            );
            version = payload.schoolYearVersion ?? version + 1;
          }
          continue;
        }
        setProgress(`Zakládám třídu ${schoolClass.code}…`);
        const payload = await requestJson<{ schoolYearVersion?: number }>(
          `/api/school-years/${schoolYearId}/classes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedSchoolYearVersion: version,
              code: schoolClass.code,
              grade: schoolClass.grade,
              name: schoolClass.code,
              profile: desiredProfile,
            }),
          },
        );
        version = payload.schoolYearVersion ?? version + 1;
      }''',
)
