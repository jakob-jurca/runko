/**
 * A phone bezel around a live mini-version of an app screen (see screens.jsx).
 * Real components, not a screenshot, so copy and data stay editable in
 * content.js. Phase 3 can drop a real screenshot in via `children`.
 *
 * The whole frame is one image to assistive tech: `label` describes it and
 * the mock UI inside is hidden.
 *
 * Phase 3 slot: pass `src` (a real screenshot, 300x620 ratio) and it replaces
 * the drawn screen. The paths live in content.js under `slots`.
 */
export default function PhoneFrame({ label, src = null, className = '', children }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`relative rounded-[2.75rem] bg-zinc-800/60 p-[7px] shadow-[0_40px_120px_-30px_rgba(249,115,22,0.18),0_30px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-inset ring-white/10 ${className}`}
    >
      <div
        aria-hidden
        className="relative h-full overflow-hidden rounded-[calc(2.75rem-7px)] bg-canvas shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
      >
        {/* Dynamic island */}
        <div className="absolute left-1/2 top-2.5 z-10 h-[22px] w-[84px] -translate-x-1/2 rounded-full bg-black" />
        {src ? <img src={src} alt="" className="h-full w-full object-cover object-top" /> : children}
      </div>
    </div>
  )
}
