import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f7f3f4] px-4 py-10">
      <section className="w-full max-w-lg rounded-[2rem] border border-red-100 bg-white p-7 text-center shadow-2xl shadow-red-950/10 sm:p-10">
        <div className="portal-error-orbit mx-auto" aria-hidden="true">
          <span className="portal-error-orbit__ring" />
          <img src="/logo.png" alt="" className="portal-error-orbit__logo" />
          <span className="portal-error-orbit__dot" />
        </div>
        <p className="mt-6 text-6xl font-black text-[#7f1d2d]">404</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">This route is not on our map</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The page may have moved, or the address may be incomplete.
        </p>
        <Link
          href="/dashboard"
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-[#7f1d2d] px-6 font-bold text-white"
        >
          Return to dashboard
        </Link>
      </section>
    </main>
  )
}
