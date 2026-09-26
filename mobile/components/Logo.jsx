import Svg, { Rect, Path } from 'react-native-svg'

export default function Logo({ size = 64 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect width="64" height="64" rx="14" fill="#09090B" />
      <Path
        d="M14 44 L26 20 L34 36 L40 26 L50 44"
        fill="none"
        stroke="#F97316"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
