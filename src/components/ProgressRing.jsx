/**
 * Animated circular progress ring (weekly completion %).
 * Pure SVG — the stroke-dashoffset transition gives the fill animation.
 */
export default function ProgressRing({ percent = 0, size = 120, stroke = 10 }) {
  const clamped = Math.min(100, Math.max(0, percent))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#27272A"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#F97316"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold">{Math.round(clamped)}%</span>
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">this week</span>
      </div>
    </div>
  )
}
