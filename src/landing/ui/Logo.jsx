/** The app's mark and wordmark, same as the sign-in screen and the app sidebar. */
export default function Logo({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img src="/runko.svg" alt="" width="32" height="32" className="h-8 w-8" />
      <span className="text-lg font-bold tracking-tight text-zinc-50">
        Run<span className="text-primary">ko</span>
      </span>
    </span>
  )
}
