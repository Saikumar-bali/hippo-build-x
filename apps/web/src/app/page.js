export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">Construction ERP</h1>
      <p className="mt-4 text-lg text-gray-600">Multi-tenant construction management platform</p>
      <div className="mt-8 grid grid-cols-3 gap-4">
        <a href="/dashboard" className="rounded-lg border p-4 hover:shadow-lg">
          Dashboard
        </a>
        <a href="/crm" className="rounded-lg border p-4 hover:shadow-lg">
          CRM
        </a>
        <a href="/projects" className="rounded-lg border p-4 hover:shadow-lg">
          Projects
        </a>
      </div>
    </main>
  );
}
