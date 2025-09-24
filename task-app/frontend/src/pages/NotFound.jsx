export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 px-4">
      <div className="max-w-lg w-full text-center">
        <h1 className="text-3xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-2 text-slate-600">The page you are looking for does not exist.</p>
        <a href="/" className="mt-6 inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800">Go home</a>
      </div>
    </div>
  )
}



