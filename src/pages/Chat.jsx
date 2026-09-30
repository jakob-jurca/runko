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
import { PaperPlaneRight, Trash } from '@phosphor-icons/react'
import { t } from '../core/strings'
import { friendlyError } from '../core/errors'

const SUGGESTIONS = t.chat.suggestions

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
      .catch((err) => setError(friendlyError(err)))
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

  if (!premium) return <Paywall feature={t.paywall.featureChat} />
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
      setError(friendlyError(err))
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
      setError(friendlyError(err))
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
    <div className="mx-auto flex h-[calc(100dvh-5.5rem-env(safe-area-inset-bottom))] max-w-2xl flex-col md:h-[100dvh]">
      <header className="flex items-center gap-3 border-b border-surface-line px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <img src="/runko.svg" alt="" className="h-10 w-10 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold leading-tight">{t.chat.title}</h1>
          <p className="text-xs text-emerald-300/90">{t.chat.online}</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-zinc-400 transition hover:bg-rose-500/10 hover:text-rose-300"
          >
            <Trash size={14} />
            {t.chat.clear}
          </button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
        {hasMore && (
          <div className="flex justify-center">
            <button
              onClick={loadEarlier}
              disabled={loadingEarlier}
              className="min-h-[36px] rounded-full bg-surface px-4 text-xs text-zinc-400 ring-1 ring-inset ring-surface-line transition hover:text-zinc-200 disabled:opacity-50"
            >
              {loadingEarlier ? t.chat.loading : t.chat.loadEarlier}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="animate-fade-up">
            <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-surface px-4 py-3 text-[15px] leading-relaxed text-zinc-100 ring-1 ring-inset ring-surface-line">
              {t.chat.greeting(profile.name?.split(' ')[0])}
            </div>
            <div className="mt-4 flex flex-col items-start gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="min-h-[40px] rounded-2xl bg-surface-raised px-4 py-2 text-left text-sm text-zinc-200 ring-1 ring-inset ring-white/10 transition hover:text-white hover:ring-primary/50 active:scale-[0.98]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                m.role === 'user'
                  ? 'rounded-br-md bg-primary text-white'
                  : 'rounded-tl-md bg-surface text-zinc-100 ring-1 ring-inset ring-surface-line'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start" aria-label={t.common.thinking}>
            <div className="flex gap-1.5 rounded-2xl rounded-tl-md bg-surface px-4 py-4 ring-1 ring-inset ring-surface-line">
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

        {error && <p className="text-center text-sm text-rose-300">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        className="flex items-center gap-2 border-t border-surface-line bg-canvas px-4 py-3 sm:px-6"
      >
        <label htmlFor="chat-input" className="sr-only">
          {t.chat.placeholder}
        </label>
        <input
          id="chat-input"
          className="input min-h-[48px] flex-1 rounded-full px-5"
          placeholder={t.chat.placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          enterKeyHint="send"
        />
        <button
          type="submit"
          disabled={!input.trim() || thinking}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-dark active:scale-95 disabled:bg-surface-raised disabled:text-zinc-600"
          aria-label={t.chat.send}
        >
          <PaperPlaneRight size={20} weight="fill" />
        </button>
      </form>

      {/* Clear-conversation confirmation. An in-app dialog rather than
          window.confirm so the promise about coach memory is actually
          readable and styled. A bottom sheet on phones. */}
      {confirmClear && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 animate-fade-in sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-chat-title"
          onClick={() => !clearing && setConfirmClear(false)}
        >
          <div
            className="w-full max-w-sm rounded-card bg-surface-raised p-6 ring-1 ring-inset ring-white/10 animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="clear-chat-title" className="text-lg font-semibold">
              {t.chat.clearTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t.chat.clearBody}</p>
            <p className="mt-3 rounded-xl bg-canvas/70 p-3 text-sm leading-relaxed text-zinc-300">
              <span className="font-semibold text-primary-light">{t.chat.clearKeepsMemoryStrong}</span>{' '}
              {t.chat.clearKeepsMemory}
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirmClear(false)} disabled={clearing} className="btn-ghost flex-1 text-sm">
                {t.common.cancel}
              </button>
              <button
                onClick={clearConversation}
                disabled={clearing}
                className="min-h-[48px] flex-1 rounded-full bg-rose-500 px-4 text-sm font-semibold text-white transition hover:bg-rose-600 active:scale-[0.98] disabled:opacity-60"
              >
                {clearing ? t.chat.clearing : t.chat.clearConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
