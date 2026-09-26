import { useEffect, useMemo, useState } from 'react'
import { Brain, BookmarkSimple } from '@phosphor-icons/react'
import { coach, mock } from '../content'
import Reveal from '../ui/Reveal'
import { prefersReducedMotion, useSeen } from '../ui/motion'

/** Pauses, in ms. A coach message shows typing dots first; a memory tag lands just after its message. */
const GAP = { user: 700, typing: 1300, tag: 600 }

/**
 * Plays the chat once, when it scrolls into view: each message goes
 * hidden -> (typing, for the coach) -> shown. Returns a state per message and
 * the set of memories that have been "remembered" so far. With reduced motion
 * everything is shown at once.
 */
function useConversation(messages, started) {
  const reduce = useMemo(prefersReducedMotion, [])
  const [states, setStates] = useState(() => messages.map(() => (reduce ? 'shown' : 'hidden')))

  useEffect(() => {
    if (!started || reduce) return
    const timers = []
    let t = 400
    const at = (ms, fn) => timers.push(setTimeout(fn, ms))
    const set = (i, value) => setStates((prev) => prev.map((s, j) => (j === i ? value : s)))
    messages.forEach((m, i) => {
      if (m.from === 'coach') {
        at(t, () => set(i, 'typing'))
        t += GAP.typing
        at(t, () => set(i, 'shown'))
        t += m.memory ? GAP.tag + 700 : 900
      } else {
        at(t, () => set(i, 'shown'))
        t += GAP.user
      }
    })
    return () => timers.forEach(clearTimeout)
  }, [started, reduce, messages])

  return states
}

function Message({ msg, index, state }) {
  const mine = msg.from === 'user'
  return (
    // Every message is always in the layout (only its opacity changes), so the
    // chat never grows or jumps while it plays. Phase 2 hook: data-msg is the order.
    <li data-msg={index} data-msg-state={state} className={`relative flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      <div
        className={`l-bubble max-w-[85%] px-4 py-3 text-[15px] leading-relaxed ${
          mine
            ? 'rounded-[1.25rem] rounded-br-md bg-primary text-white'
            : 'rounded-[1.25rem] rounded-bl-md bg-surface-raised text-zinc-200 ring-1 ring-inset ring-white/[0.06]'
        }`}
      >
        {msg.text}
      </div>
      {!mine && (
        <span
          aria-hidden
          className="l-typing absolute left-0 top-0 flex items-center gap-1.5 rounded-[1.25rem] rounded-bl-md bg-surface-raised px-4 py-[18px] ring-1 ring-inset ring-white/[0.06]"
        >
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ '--i': i }} className="l-dot h-1.5 w-1.5 rounded-full bg-zinc-400" />
          ))}
        </span>
      )}
      {msg.memory && (
        <span className="l-tag mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-faint px-2.5 py-1 text-[11px] font-medium text-primary-light">
          <BookmarkSimple size={12} weight="fill" />
          {msg.memory}
        </span>
      )}
    </li>
  )
}

/**
 * The chat next to what the coach has remembered. When a coach reply that
 * carries a memory tag appears, the matching line on the right lights up.
 */
export default function ChapterCoach() {
  const [ref, seen] = useSeen({ amount: 0.45 })
  const states = useConversation(mock.chat, seen)

  const remembered = new Set(mock.chat.filter((m, i) => m.memory && states[i] === 'shown').map((m) => m.memory))

  return (
    <section className="l-section">
      <Reveal className="max-w-3xl">
        <span className="l-eyebrow">{coach.eyebrow}</span>
        <h2 className="l-h2">{coach.title}</h2>
        <p className="l-lead">{coach.intro}</p>
      </Reveal>

      <div className="mt-14 grid gap-6 lg:grid-cols-12 lg:items-start">
        <Reveal className="l-shell lg:col-span-7">
          <div ref={ref} className="l-core" role="group" aria-label={coach.chatLabel}>
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4">
              <img src="/runko.svg" alt="" className="h-8 w-8" />
              <span className="font-semibold text-zinc-100">{coach.coachName}</span>
            </div>
            <ul className="space-y-4 p-4 sm:p-6">
              {mock.chat.map((m, i) => (
                <Message key={i} msg={m} index={i} state={states[i]} />
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal delay={120} className="lg:sticky lg:top-28 lg:col-span-5">
          <div className="rounded-[2rem] p-6 ring-1 ring-inset ring-white/[0.08] md:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-faint text-primary">
                <Brain size={22} />
              </span>
              <h3 className="text-lg font-semibold tracking-tight text-zinc-50">{coach.memoryLabel}</h3>
            </div>
            <ul className="mt-6 space-y-3">
              {mock.memories.map((m, i) => {
                // The goal is known from the start; the rest light up as the chat mentions them.
                const lit = i === 0 || remembered.has(m)
                return (
                  <li key={m} data-lit={lit ? 'true' : 'false'} className="flex items-start gap-3 text-zinc-300">
                    <BookmarkSimple size={16} weight="fill" className="mt-1 shrink-0 text-primary" />
                    <span>{m}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
