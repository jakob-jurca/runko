import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { supabase } from '../../src/core/supabase'
import { t } from '../../src/core/strings'
import { useAuth, resetRedirectUrl } from '../context/AuthContext'
import Logo from '../components/Logo'
import { Button, ErrorText, FullScreenSpinner, Input, Label, LinkText, Screen, Text } from '../components/ui'

/** Login / signup / forgot password. Mirrors src/pages/Auth.jsx. */
export default function Auth() {
  const { recovery, loading } = useAuth()
  const router = useRouter()
  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <FullScreenSpinner />
  if (recovery) return <Redirect href="/reset-password" />

  const reset = (m) => {
    setMode(m)
    setError('')
    setInfo('')
  }
  const isCredentialError = /invalid login credentials|invalid email or password/i.test(error)

  const submit = async () => {
    setError('')
    setInfo('')
    setBusy(true)
    try {
      const address = email.trim()
      if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({ email: address, password })
        if (err) throw err
        if (!data.session) {
          setInfo(t.auth.confirmEmail)
          return
        }
        router.replace('/onboarding')
      } else if (mode === 'forgot') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: resetRedirectUrl() })
        if (err) throw err
        // Same message whether or not the address exists.
        setInfo(t.auth.forgotSent)
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: address, password })
        if (err) throw err
        router.replace('/')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const active = mode === 'forgot' ? 'login' : mode
  return (
    <Screen edges={['top', 'bottom']} scroll={false}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Screen.Scroll contentContainerClassName="flex-grow justify-center px-6 py-8">
          <View className="mb-10 items-center">
            <Logo size={64} />
            <Text className="mt-4 text-4xl font-extrabold">
              Run<Text className="text-4xl font-extrabold text-primary">ko</Text>
            </Text>
            <Text className="mt-2 text-zinc-400">{t.common.appTagline}</Text>
          </View>

          <View className="mb-6 flex-row rounded-full bg-zinc-900 p-1">
            {['login', 'signup'].map((m) => (
              <Pressable
                key={m}
                onPress={() => reset(m)}
                className={`flex-1 items-center rounded-full py-2.5 ${active === m ? 'bg-primary' : ''}`}
              >
                <Text className={`text-sm font-semibold ${active === m ? 'text-white' : 'text-zinc-400'}`}>
                  {m === 'login' ? t.auth.login : t.auth.signup}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="gap-4">
            <View>
              <Label>{t.auth.email}</Label>
              <Input
                value={email}
                onChangeText={setEmail}
                placeholder={t.auth.emailPlaceholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
              />
            </View>
            {mode !== 'forgot' && (
              <View>
                <Label>{t.auth.password}</Label>
                <Input
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
                {mode === 'login' && (
                  <View className="mt-2">
                    <LinkText onPress={() => reset('forgot')}>{t.auth.forgotPassword}</LinkText>
                  </View>
                )}
              </View>
            )}
            {mode === 'forgot' && <Text className="text-sm leading-5 text-zinc-400">{t.auth.forgotIntro}</Text>}

            {!!error && (
              <View className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                <ErrorText>{error}</ErrorText>
                {isCredentialError && (
                  <View className="mt-2">
                    <LinkText onPress={() => reset('forgot')}>{t.auth.resetCta}</LinkText>
                  </View>
                )}
              </View>
            )}
            {!!info && <Text className="text-sm text-emerald-400">{info}</Text>}

            <Button
              busy={busy}
              disabled={!email.trim() || (mode !== 'forgot' && password.length < 6)}
              onPress={submit}
              title={mode === 'login' ? t.auth.loginButton : mode === 'forgot' ? t.auth.forgotButton : t.auth.signupButton}
            />
            {mode === 'forgot' && (
              <Pressable onPress={() => reset('login')} className="items-center py-1">
                <Text className="text-xs text-zinc-500">{t.auth.backToLogin}</Text>
              </Pressable>
            )}
          </View>
          {mode === 'signup' && <Text className="mt-4 text-center text-xs text-zinc-500">{t.auth.trialNote}</Text>}
        </Screen.Scroll>
      </KeyboardAvoidingView>
    </Screen>
  )
}
