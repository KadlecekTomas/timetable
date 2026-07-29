const services = [
  { name: "Web", detail: "Next.js App Router", status: "Připraveno" },
  {
    name: "Databáze",
    detail: "PostgreSQL + Prisma",
    status: "Připraveno",
  },
  { name: "Solver", detail: "FastAPI + OR-Tools", status: "Připraveno" },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-16">
      <section className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">
          Timetable
        </p>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Kvalitní školní rozvrh bez tvrdých konfliktů.
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-600">
          Repository foundation je připravený pro import školních dat,
          verzované generování a vysvětlitelné optimalizační skóre.
        </p>
      </section>

      <section
        className="grid gap-4 md:grid-cols-3"
        aria-label="Stav služeb"
      >
        {services.map((service) => (
          <article
            key={service.name}
            className="rounded-2xl border bg-white p-6 shadow-sm"
          >
            <div className="mb-8 flex items-center justify-between gap-4">
              <h2 className="font-semibold">{service.name}</h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                {service.status}
              </span>
            </div>
            <p className="text-sm text-slate-600">{service.detail}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
