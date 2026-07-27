'use client';

export default function Error({ error, reset }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h2 className="text-2xl font-bold text-red-600">Something went wrong</h2>
      <p className="text-gray-600">{error.message}</p>
      <button
        onClick={() => reset()}
        className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  );
}
