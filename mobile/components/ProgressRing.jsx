import { View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { Text } from './ui'

/** Circular progress ring (weekly completion %). Same look as the web ring. */
export default function ProgressRing({ percent = 0, size = 92, stroke = 8 }) {
  const clamped = Math.min(100, Math.max(0, percent))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#26262B" strokeWidth={stroke} />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#F97316"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
        />
      </Svg>
      <Text className="text-xl font-semibold tabular-nums">{Math.round(clamped)}%</Text>
    </View>
  )
}
