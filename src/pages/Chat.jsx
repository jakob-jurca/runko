import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getChatMessages,
  addChatMessage,
  deleteChatMessages,
  getPlans,
  getWorkouts,
  currentWeekNumber,
} from '../core/db'
import { askCoach, extractMemories, friendlyAiMessage } from '../core/ai'
import { getMemories, saveExtractedMemories } from '../core/memory'
import { hasPremium } from '../core/subscription'
import Paywall from '../components/Paywall'
import { FullScreenSpinner } from '../components/Spinner'

const SUGGESTIONS = [
  'How should I pace my long run?',
  'My legs feel heavy today — should I still run?',
  'What should I eat before a morning run?',
]

/** How many messages the SCREEN holds initially, and per "load earlier". */
const PAGE_SIZE = 50

/**
 * AI Coach Chat (premium feature).
 *
 * ONE ongoing conversation — the coach is supposed to know the whole history,
 * so nothing here starts a new thread. What is bounded is rendering: the view
 * holds the most recent 50 messages with a "Load earlier messages" button
 * above them. The AI context is separately capped at the last 20 messages
 * (see askCoach in core/ai.js).
 *
 * The view opens ALREADY at the bottom — scroll position is set before paint
 * in useLayoutEffect, so the runner never watches the history scroll past.
 *
 * After each reply a background call looks for anything durable worth
 * remembering (core/memory.js). It never blocks the UI and never surfaces an
 * error — memory is an enhancement, not a feature the chat depends on.
 */
export default function Chat() {
  const { profile } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  const scrollRef = useRef(null)
  const bottomRef = useRef(null)
  // Becomes true once the opening jump-to-bottom has happened; until then no
  // smooth scrolling is allowed.
  const openedRef = useRef(false)

  // Everything the coach needs, refreshed when the page loads.
  const [ctx, setCtx] = useState({ plans: [], currentWeek: null, workouts: [], memories: [] })

  const premium = hasPremium(profile)

  useEffect(() => {
    if (!premium) {
      setLoading(false)
      return
    }
    let cancelled = false
    Promise.all([
      getChatMessages(profile.id, { limit: PAGE_SIZE }),
      getPlans(profile.id),
      getWorkouts(profile.id, { limit: 10 }), // the coach sees the last 10 runs
      getMemories(profile.id).catch(() => []), // memory is optional, never fatal
    ])
      .then(([msgs, plans, workouts, memories]) => {
        if (cancelled) return
        setMessages(msgs)
        // A full page back means there is probably more behind it.
        setHasMore(msgs.length >= PAGE_SIZE)
        setCtx({ plans, currentWeek: currentWeekNumber(plans), workouts, memories })
      })
      .catch((err) => setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [profile, premium])

  /**
   * Opening jump: set scrollTop directly, before the browser paints, so the
   * conversation is simply already at the bottom. scrollIntoView (even with
   * behavior:'auto') is not used here because it can animate inside a
   * scrollable ancestor and would show the travel.
   */
  useLayoutEffect(() => {
    if (loading || openedRef.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    openedRef.current = true
  }, [loading, messages])

  /** After the first paint, new messages scroll smoothly as you would expect. */
  useEffect(() => {
    if (!openedRef.current) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  if (!premium) return <Paywall feature="The AI coach chat" />
  if (loading) return <FullScreenSpinner />

  /** Prepend the previous page, keeping the reading position steady. */
  const loadEarlier = async () => {
    if (loadingEarlier || !messages.length) return
    setLoadingEarlier(true)
    const el = scrollRef.current
    const heightBefore = el?.scrollHeight ?? 0
    try {
      const older = await getChatMessages(profile.id, {
        limit: PAGE_SIZE,
        before: messages[0].created_at,
      })
      setMessages((m) => [...older, ...m])
      setHasMore(older.length >= PAGE_SIZE)
      // Keep the message the runner was looking at under the cursor instead
      // of jumping to the top of the newly inserted block.
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - heightBefore
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingEarlier(false)
    }
  }

  const clearConversation = async () => {
    setClearing(true)
    try {
      await deleteChatMessages(profile.id)
      setMessages([])
      setHasMore(false)
      setConfirmClear(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setClearing(false)
    }
  }

  /**
   * Fire-and-forget: look for a durable fact in the exchange and store it.
   * Deliberately not awaited — the runner should never wait on it, and a
   * failure here must never reach the conversation.
   */
  const rememberFrom = (userMessage, coachReply) => {
    extractMemories({ userMessage, coachReply, existing: ctx.memories })
      .then(async (facts) => {
        if (!facts.length) return
        const saved = await saveExtractedMemories(profile.id, facts)
        setCtx((c) => ({ ...c, memories: [...saved, ...c.memories] }))
      })
      .catch(() => {})
  }

  const send = async (text) => {
    const content = (text ?? input).trim()
    if (!content || thinking) return
    setInput('')
    setError('')
    setThinking(true)

    // Optimistic render, then persist.
    const userMsg = { role: 'user', content, id: `tmp-${Date.now()}` }
    const history = [...messages, userMsg]
    setMessages(history)

    try {
      await addChatMessage(profile.id, 'user', content)
      // AI INTEGRATION POINT — the coach answers with full runner context.
      // askCoach caps the model's view at the last 20 messages.
      const reply = await askCoach({
        profile,
        memories: ctx.memories,
        plans: ctx.plans,
        currentWeek: ctx.currentWeek,
        workouts: ctx.workouts,
        history: history.map(({ role, content }) => ({ role, content })),
      })
      const saved = await addChatMessage(profile.id, 'assistant', reply.trim())
      setMessages((m) => [...m, saved])
      rememberFrom(content, reply)
    } catch (err) {
      // Show the failure as a friendly coach bubble instead of a raw error —
      // not persisted, so it disappears once the conversation moves on.
      setMessages((m) => [
        ...m,
        { id: `tmp-err-${Date.now()}`, role: 'assistant', content: friendlyAiMessage(err) },
      ])
    } finally {
      setThinking(false)
    }
  }

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col px-5 pt-6 md:h-screen">
      <header className="flex items-center gap-3 border-b border-zinc-800 pb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-faint text-xl">
          🏃
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-bold">Coach Runko</h1>
          <p className="text-xs text-emerald-400">● online</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="shrink-0 rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-rose-500/60 hover:text-rose-400"
          >
            Clear conversation
          </button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-6 pb-28 md:pb-6">
        {hasMore && (
          <div className="flex justify-center">
            <button
              onClick={loadEarlier}
              disabled={loadingEarlier}
              className="rounded-full border border-zinc-800 px-4 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-50"
            >
              {loadingEarlier ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="animate-fade-up">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-zinc-900 px-4 py-3 text-sm leading-relaxed">
              Hey {profile.name?.split(' ')[0] || 'there'}! I’m your coach. Ask me anything about
              training, pacing, recovery or race prep. 🔥
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-primary hover:text-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'rounded-br-sm bg-primary text-white'
                  : 'rounded-tl-sm bg-zinc-900 text-zinc-100'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start">
            <div className="flex gap-1.5 rounded-2xl rounded-tl-sm bg-zinc-900 px-4 py-4">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-2 w-2 animate-pulse-dot rounded-full bg-zinc-500"
                  style={{ animationDelay: `${i * 200}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-center text-xs text-rose-400">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        className="fixed inset-x-0 bottom-20 mx-auto flex max-w-2xl gap-2 px-5 md:sticky md:bottom-0 md:bg-zinc-950 md:py-4"
      >
        <input
          className="input flex-1"
          placeholder="Ask your coach…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={!input.trim() || thinking}
          className="btn-primary !px-4"
          aria-label="Send"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m0 0l-6-6m6 6l-6 6" />
          </svg>
        </button>
      </form>

      {/* Clear-conversation confirmation. An in-app dialog rather than
          window.confirm so the promise about coach memory is actually
          readable and styled. */}
      {confirmClear && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-chat-title"
          onClick={() => !clearing && setConfirmClear(false)}
        >
          <div className="card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 id="clear-chat-title" className="text-lg font-bold">
              Clear this conversation?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              This deletes every message between you and your coach. It cannot be undone.
            </p>
            <p className="mt-3 rounded-xl bg-zinc-950/60 p-3 text-sm leading-relaxed text-zinc-300">
              <span className="font-semibold text-primary">
                What your coach remembers about you is kept.
              </span>{' '}
              Your injuries, schedule and preferences stay exactly as they are — you can review
              or delete those any time in Settings.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmClear(false)}
                disabled={clearing}
                className="btn-ghost flex-1 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={clearConversation}
                disabled={clearing}
                className="flex-1 rounded-xl bg-rose-500/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
              >
                {clearing ? 'Clearing…' : 'Clear conversation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
