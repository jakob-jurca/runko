import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../context/AuthContext'
import { getChatMessages, addChatMessage, deleteChatMessages, getPlans, getWorkouts, currentWeekNumber } from '../../../src/core/db'
import { askCoach, extractMemories, friendlyAiMessage } from '../../../src/core/ai'
import { getMemories, saveExtractedMemories } from '../../../src/core/memory'
import { hasPremium } from '../../../src/core/subscription'
import { t } from '../../../src/core/strings'
import Paywall from '../../components/Paywall'
import Logo from '../../components/Logo'
import { Button, FullScreenSpinner, Screen, Text } from '../../components/ui'
import { colors } from '../../lib/theme'

const SUGGESTIONS = t.chat.suggestions
const PAGE_SIZE = 50

function TypingDots() {
  const values = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current
  useEffect(() => {
    const loops = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(v, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ]),
      ),
    )
    loops.forEach((l) => l.start())
    return () => loops.forEach((l) => l.stop())
  }, [values])
  return (
    <View className="flex-row gap-1.5 self-start rounded-2xl rounded-tl-md border border-surface-line bg-surface px-4 py-4" accessibilityLabel={t.common.thinking}>
      {values.map((v, i) => (
        <Animated.View key={i} style={{ opacity: v }} className="h-2 w-2 rounded-full bg-zinc-500" />
      ))}
    </View>
  )
}

function Bubble({ message }) {
  const mine = message.role === 'user'
  return (
    <View className={`my-1.5 max-w-[85%] ${mine ? 'self-end' : 'self-start'}`}>
      <View
        className={`rounded-2xl px-4 py-2.5 ${
          mine ? 'rounded-br-md bg-primary' : 'rounded-tl-md border border-surface-line bg-surface'
        }`}
      >
        <Text selectable className={`text-[15px] leading-6 ${mine ? 'text-white' : 'text-zinc-100'}`}>
          {message.content}
        </Text>
      </View>
    </View>
  )
}

/**
 * AI coach chat (premium). One ongoing conversation; the screen holds the
 * latest 50 messages with "Naloži starejša sporočila" above them.
 *
 * The list is inverted (newest first, drawn bottom-up), so it opens already at
 * the bottom with no scroll to watch, new messages appear at the bottom, and
 * older messages are appended without moving the reading position.
 */
export default function Chat() {
  const { profile } = useAuth()
  const [messages, setMessages] = useState([]) // oldest -> newest
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
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
      getWorkouts(profile.id, { limit: 10 }),
      getMemories(profile.id).catch(() => []),
    ])
      .then(([msgs, plans, workouts, memories]) => {
        if (cancelled) return
        setMessages(msgs)
        setHasMore(msgs.length >= PAGE_SIZE)
        setCtx({ plans, currentWeek: currentWeekNumber(plans), workouts, memories })
      })
      .catch((err) => setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [profile, premium])

  const loadEarlier = useCallback(async () => {
    if (loadingEarlier || !messages.length) return
    setLoadingEarlier(true)
    try {
      const older = await getChatMessages(profile.id, { limit: PAGE_SIZE, before: messages[0].created_at })
      setMessages((m) => [...older, ...m])
      setHasMore(older.length >= PAGE_SIZE)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingEarlier(false)
    }
  }, [loadingEarlier, messages, profile.id])

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

  /** Fire-and-forget: store a durable fact from the exchange; never blocks or errors into the chat. */
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
    const userMsg = { role: 'user', content, id: `tmp-${Date.now()}` }
    const history = [...messages, userMsg]
    setMessages(history)
    try {
      await addChatMessage(profile.id, 'user', content)
      const reply = await askCoach({
        profile,
        memories: ctx.memories,
        plans: ctx.plans,
        currentWeek: ctx.currentWeek,
        workouts: ctx.workouts,
        history: history.map(({ role, content: c }) => ({ role, content: c })),
      })
      const saved = await addChatMessage(profile.id, 'assistant', reply.trim())
      setMessages((m) => [...m, saved])
      rememberFrom(content, reply)
    } catch (err) {
      setMessages((m) => [...m, { id: `tmp-err-${Date.now()}`, role: 'assistant', content: friendlyAiMessage(err) }])
    } finally {
      setThinking(false)
    }
  }

  if (!premium) {
    return (
      <Screen>
        <Paywall feature={t.paywall.featureChat} />
      </Screen>
    )
  }
  if (loading) return <FullScreenSpinner />

  const data = [...messages].reverse() // inverted list: index 0 is the bottom

  const Empty = (
    <View className="pb-2">
      <View className="max-w-[85%] self-start rounded-2xl rounded-tl-md border border-surface-line bg-surface px-4 py-3">
        <Text className="text-[15px] leading-6">{t.chat.greeting(profile.name?.split(' ')[0])}</Text>
      </View>
      <View className="mt-4 items-start gap-2">
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s}
            onPress={() => send(s)}
            className="min-h-[44px] justify-center rounded-2xl border border-white/10 bg-surface-raised px-4 py-2 active:opacity-70"
          >
            <Text className="text-sm text-zinc-200">{s}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="flex-row items-center gap-3 border-b border-surface-line px-4 pb-3 pt-2">
          <Logo size={40} />
          <View className="flex-1">
            <Text className="text-base font-semibold leading-tight">{t.chat.title}</Text>
            <Text className="text-xs text-emerald-300/90">{t.chat.online}</Text>
          </View>
          {messages.length > 0 && (
            <Pressable onPress={() => setConfirmClear(true)} className="min-h-[40px] flex-row items-center gap-1.5 rounded-full px-3 active:bg-rose-500/10">
              <Ionicons name="trash-outline" size={14} color={colors.zinc400} />
              <Text className="text-xs font-medium text-zinc-400">{t.chat.clear}</Text>
            </Pressable>
          )}
        </View>

        <FlatList
          inverted
          data={data}
          keyExtractor={(m) => String(m.id)}
          renderItem={({ item }) => <Bubble message={item} />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, flexGrow: 1 }}
          ListHeaderComponent={
            <View>
              {thinking && <TypingDots />}
              {!!error && <Text className="mt-2 text-center text-sm text-rose-300">{error}</Text>}
            </View>
          }
          ListFooterComponent={
            hasMore ? (
              <View className="items-center pb-2 pt-1">
                <Pressable
                  onPress={loadEarlier}
                  disabled={loadingEarlier}
                  className={`min-h-[40px] justify-center rounded-full border border-surface-line bg-surface px-4 ${loadingEarlier ? 'opacity-50' : ''}`}
                >
                  <Text className="text-xs text-zinc-400">{loadingEarlier ? t.chat.loading : t.chat.loadEarlier}</Text>
                </Pressable>
              </View>
            ) : null
          }
          ListEmptyComponent={Empty}
        />

        <View className="flex-row items-end gap-2 border-t border-surface-line bg-canvas px-4 py-3">
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t.chat.placeholder}
            placeholderTextColor={colors.zinc500}
            selectionColor={colors.primary}
            multiline
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={Platform.OS === 'web' ? () => send() : undefined}
            className="max-h-32 min-h-[48px] flex-1 rounded-3xl border border-white/10 bg-surface-raised px-5 py-3 font-g4 text-base text-zinc-100"
          />
          <Pressable
            onPress={() => send()}
            disabled={!input.trim() || thinking}
            accessibilityLabel={t.chat.send}
            className={`h-12 w-12 items-center justify-center rounded-full ${!input.trim() || thinking ? 'bg-surface-raised' : 'bg-primary active:opacity-80'}`}
          >
            <Ionicons name="send" size={20} color={!input.trim() || thinking ? colors.zinc600 : '#fff'} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={confirmClear} transparent animationType="fade" onRequestClose={() => !clearing && setConfirmClear(false)}>
        <Pressable className="flex-1 justify-end bg-black/70 p-3" onPress={() => !clearing && setConfirmClear(false)}>
          <Pressable className="rounded-card border border-white/10 bg-surface-raised p-6">
            <Text className="text-lg font-semibold">{t.chat.clearTitle}</Text>
            <Text className="mt-2 text-sm leading-5 text-zinc-400">{t.chat.clearBody}</Text>
            <View className="mt-3 rounded-xl bg-canvas/70 p-3">
              <Text className="text-sm leading-5 text-zinc-300">
                <Text className="text-sm font-semibold text-primary-light">{t.chat.clearKeepsMemoryStrong}</Text> {t.chat.clearKeepsMemory}
              </Text>
            </View>
            <View className="mt-5 flex-row gap-2">
              <Button variant="ghost" className="flex-1" disabled={clearing} title={t.common.cancel} onPress={() => setConfirmClear(false)} />
              <Pressable
                onPress={clearConversation}
                disabled={clearing}
                className={`min-h-[48px] flex-1 items-center justify-center rounded-full bg-rose-500 px-4 active:opacity-80 ${clearing ? 'opacity-60' : ''}`}
              >
                <Text className="text-sm font-semibold text-white">{clearing ? t.chat.clearing : t.chat.clearConfirm}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
