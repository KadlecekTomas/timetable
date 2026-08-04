import { redirect } from "next/navigation";

export default async function LegacyImportRedirect({
  searchParams,
}: {
  searchParams: Promise<{ schoolYearId?: string }>;
}) {
  const { schoolYearId } = await searchParams;
  const query = schoolYearId
    ? `?schoolYearId=${encodeURIComponent(schoolYearId)}`
    : "";
  redirect(`/staffing${query}`);
}
