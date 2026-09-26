import { ActivityIndicator, Pressable, ScrollView, Text as RNText, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '../lib/theme'

const WEIGHTS = { extrabold: 'g8', bold: 'g7', semibold: 'g6', medium: 'g5' }
const WEIGHT_RE = /\bfont-(extrabold|bold|semibold|medium)\b/
const NOT_COLOR_RE = /\btext-(?!(xs|sm|base|lg|xl|\dxl|center|left|right)\b|\[\d)/

/** Geist has one font file per weight; RN cannot pick them from font-bold. */
export function Text({ className = '', ...props }) {
  const m = className.match(WEIGHT_RE)
  const family = m ? WEIGHTS[m[1]] : 'g4'
  const cleaned = className.replace(new RegExp(WEIGHT_RE.source, 'g'), '')
  // Default colour only when the caller sets none (class order is not a tiebreaker).
  const hasColor = NOT_COLOR_RE.test(cleaned)
  return <RNText className={`font-${family} ${hasColor ? '' : 'text-zinc-100'} ${cleaned}`} {...props} />
}

export function Spinner({ size = 'small', color = colors.primary }) {
  return <ActivityIndicator size={size} color={color} />
}

export function FullScreenSpinner() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <Spinner size="large" />
    </View>
  )
}

/** Safe-area screen on the dark canvas. `scroll` wraps children in a ScrollView. */
export function Screen({ children, scroll = true, edges = ['top'], className = '', contentClassName = '', ...rest }) {
  return (
    <SafeAreaView edges={edges} className={`flex-1 bg-canvas ${className}`}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName={`px-5 pb-10 pt-4 ${contentClassName}`}
          {...rest}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </SafeAreaView>
  )
}

/** A ScrollView that keeps taps working while the keyboard is open. */
Screen.Scroll = function ScreenScroll(props) {
  return <ScrollView keyboardShouldPersistTaps="handled" {...props} />
}

export function Card({ children, className = '', ...rest }) {
  return (
    <View className={`rounded-card border border-surface-line bg-surface p-5 ${className}`} {...rest}>
      {children}
    </View>
  )
}

export function Button({ title, onPress, variant = 'primary', busy = false, disabled = false, className = '', children }) {
  const off = disabled || busy
  const base = variant === 'primary' ? 'bg-primary' : 'bg-surface-raised border border-white/10'
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      className={`min-h-[48px] flex-row items-center justify-center gap-2 rounded-full px-6 py-3 active:opacity-80 ${base} ${off ? 'opacity-40' : ''} ${className}`}
    >
      {busy ? (
        <Spinner color="#fff" />
      ) : (
        children ?? <Text className={`font-semibold ${variant === 'primary' ? 'text-white' : 'text-zinc-200'}`}>{title}</Text>
      )}
    </Pressable>
  )
}

export function Label({ children }) {
  return <Text className="mb-2 text-sm font-medium text-zinc-300">{children}</Text>
}

export function Input({ className = '', ...props }) {
  return (
    <TextInput
      placeholderTextColor={colors.zinc500}
      selectionColor={colors.primary}
      className={`min-h-[48px] w-full rounded-xl border border-white/10 bg-surface-raised px-4 py-3 font-g4 text-base text-zinc-100 ${className}`}
      {...props}
    />
  )
}

export function LinkText({ children, onPress, className = '' }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} className="self-start py-1">
      <Text className={`text-sm font-medium text-primary underline ${className}`}>{children}</Text>
    </Pressable>
  )
}

export function SectionTitle({ children, className = '' }) {
  return <Text className={`text-sm font-semibold text-zinc-400 ${className}`}>{children}</Text>
}

export function ErrorText({ children }) {
  return children ? <Text className="text-sm text-rose-400">{children}</Text> : null
}
