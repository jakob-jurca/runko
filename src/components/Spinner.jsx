export default function Spinner({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`animate-spin text-primary ${className}`}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
      <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

export function FullScreenSpinner({ message }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Spinner className="h-10 w-10" />
      {message && <p className="animate-pulse-dot text-sm text-zinc-400">{message}</p>}
    </div>
  )
}
