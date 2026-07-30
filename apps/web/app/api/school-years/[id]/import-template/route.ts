import { createImportTemplate } from "@/lib/import/workbook";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  await context.params;
  const buffer = await createImportTemplate();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="timetable-import-1.0.0.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
