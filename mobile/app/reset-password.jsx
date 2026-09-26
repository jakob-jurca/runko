import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../src/core/supabase'
import { t } from '../../src/core/strings'
import { useAuth, resetRedirectUrl } from '../context/AuthContext'
import Logo from '../components/Logo'
import { Button, Card, ErrorText, FullScreenSpinner, Input, Label, Screen, Text } from '../components/ui'

const MIN_LENGTH = 6

/** Supabase updateUser error -> something a Slovenian runner can act on. */
function describeUpdateError(err) {
  const code = err?.code || ''
  const msg = err?.message || ''
  if (code === 'same_password' || /different from the old/i.test(msg)) return t.reset.samePassword
  if (code === 'weak_password' || /weak/i.test(msg)) return t.reset.weakPassword
  if (err?.name === 'AuthSessionMissingError' || code === 'session_not_found' || /session/i.test(msg)) {
    return t.reset.sessionGone
  }
  if (err?.status === 429 || /rate limit/i.test(msg)) return t.reset.rateLimited
  return t.reset.genericError
}

/**
 * Where the emailed link lands (runko://reset-password). AuthContext has
 * already turned the link into a recovery session and raised the recovery
 * flag; every other screen redirects here until the password is changed or
 * the runner cancels (which ends the session). A rejected link (expired,
 * already used) shows a form to request a fresh one.
 */
export default function ResetPassword() {
  const { session, clearRecovery, cancelRecovery, loading, linkFailed } = useAuth()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [email, setEmail] = useState('')
  const [resendInfo, setResendInfo] = useState('')
  const [resendError, setResendError] = useState('')

  const submit = async () => {
    setError('')
    if (password.length < MIN_LENGTH) return setError(t.reset.tooShort(MIN_LENGTH))
    if (password !== confirm) return setError(t.reset.mismatch)
    setBusy(true)
    try {
      const userEmail = session?.user?.email
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      // Swap the recovery session for an ordinary one by signing in with the
      // new password (which also proves it works), then revoke other sessions.
      if (userEmail) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: userEmail, password })
        if (signInError) console.warn('[reset] Password changed but re-login failed:', signInError.message)
        else await supabase.auth.signOut({ scope: 'others' }).catch(() => {})
      }
      await clearRecovery()
      setDone(true)
      setTimeout(() => router.replace('/'), 900)
    } catch (err) {
      setError(describeUpdateError(err))
      setBusy(false)
    }
  }

  const requestNewLink = async () => {
    setResendError('')
    setResendInfo('')
    setBusy(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: resetRedirectUrl(),
      })
      if (resetError) throw resetError
      setResendInfo(t.reset.newSent)
    } catch (err) {
      setResendError(
        err?.status === 429 || /rate limit/i.test(err?.message || '') ? t.reset.rateLimited : t.reset.genericError,
      )
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    await cancelRecovery()
    router.replace('/auth')
  }

  if (loading && !done) return <FullScreenSpinner />

  const brokenLink = !done && (linkFailed || !session)

  return (
    <Screen edges={['top', 'bottom']} scroll={false}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Screen.Scroll contentContainerClassName="flex-grow justify-center px-6 py-8">
          <View className="mb-10 items-center">
            <Logo size={64} />
            <Text className="mt-4 text-center text-3xl font-extrabold">
              {brokenLink ? t.reset.expiredTitle : t.reset.title}
            </Text>
            <Text className="mt-2 text-center text-sm text-zinc-400">
              {brokenLink ? t.reset.expiredSubtitle : t.reset.subtitle}
            </Text>
          </View>

          {brokenLink ? (
            <Card className="gap-4">
              <Text className="text-sm leading-5 text-zinc-400">{t.reset.expiredBody}</Text>
              <View>
                <Label>{t.auth.email}</Label>
                <Input
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t.auth.emailPlaceholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>
              <ErrorText>{resendError}</ErrorText>
              {!!resendInfo && <Text className="text-sm text-emerald-400">{resendInfo}</Text>}
              <Button busy={busy} disabled={!email.trim()} onPress={requestNewLink} title={t.reset.requestNew} />
              <Pressable onPress={() => router.replace('/auth')} className="items-center py-1">
                <Text className="text-xs text-zinc-500 underline">{t.reset.backToLogin}</Text>
              </Pressable>
            </Card>
          ) : done ? (
            <Card className="items-center">
              <Text className="text-3xl">✅</Text>
              <Text className="mt-3 font-semibold">{t.reset.doneTitle}</Text>
              <Text className="mt-1 text-sm text-zinc-400">{t.reset.doneBody}</Text>
            </Card>
          ) : (
            <View className="gap-4">
              <View>
                <Label>{t.reset.newPassword}</Label>
                <Input
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </View>
              <View>
                <Label>{t.reset.confirmPassword}</Label>
                <Input
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </View>
              <ErrorText>{error}</ErrorText>
              <Button busy={busy} disabled={!password || !confirm} onPress={submit} title={t.reset.submit} />
              {/* Leaving must end the recovery session, not just the screen. */}
              <Pressable onPress={cancel} disabled={busy} className="items-center py-1">
                <Text className="text-xs text-zinc-600 underline">{t.reset.cancel}</Text>
              </Pressable>
            </View>
          )}
        </Screen.Scroll>
      </KeyboardAvoidingView>
    </Screen>
  )
}
