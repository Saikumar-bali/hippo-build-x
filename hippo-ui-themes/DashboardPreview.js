'use client';

import ThemeSwitcher from "./ThemeSwitcher";

const metrics = [
  ["Active projects", "12", "+2 this month"],
  ["Units sold", "342", "+15.3%"],
  ["Receivables", "₹2.45 Cr", "₹38 L due"],
  ["Overall progress", "68%", "+4.2%"]
];

export default function DashboardPreview() {
  return (
    <main className="min-h-screen p-6" style={{ color: "var(--ui-text)", background: "var(--ui-background)" }}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm" style={{ color: "var(--ui-text-muted)" }}>Hippo Build X</p>
          <h1 className="text-2xl font-semibold">Construction ERP Dashboard</h1>
        </div>
        <ThemeSwitcher />
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, detail]) => (
          <article key={label} className="border p-5" style={{ background: "var(--ui-surface)", borderColor: "var(--ui-border)", borderRadius: "var(--ui-radius)" }}>
            <p className="text-sm" style={{ color: "var(--ui-text-muted)" }}>{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-sm" style={{ color: "var(--ui-success)" }}>{detail}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <article className="border p-5" style={{ background: "var(--ui-surface)", borderColor: "var(--ui-border)", borderRadius: "var(--ui-radius)" }}>
          <h2 className="mb-5 font-semibold">Collection trend</h2>
          <div className="flex h-52 items-end gap-3">
            {[42, 58, 52, 74, 68, 88].map((height, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-2">
                <div className="w-full rounded-t-lg" style={{ height: `${height}%`, background: index === 5 ? "var(--ui-primary)" : "var(--ui-primary-soft)" }} />
                <span className="text-xs" style={{ color: "var(--ui-text-muted)" }}>{["Feb", "Mar", "Apr", "May", "Jun", "Jul"][index]}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="border p-5" style={{ background: "var(--ui-surface)", borderColor: "var(--ui-border)", borderRadius: "var(--ui-radius)" }}>
          <h2 className="mb-5 font-semibold">Project progress</h2>
          {[ ["Green Valley Residency",72], ["Sunrise Towers",45], ["Ocean View Apartments",28] ].map(([name, progress]) => (
            <div key={name} className="mb-5">
              <div className="mb-2 flex justify-between text-sm"><span>{name}</span><strong>{progress}%</strong></div>
              <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--ui-surface-muted)" }}>
                <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "var(--ui-primary)" }} />
              </div>
            </div>
          ))}
        </article>
      </section>
    </main>
  );
}
