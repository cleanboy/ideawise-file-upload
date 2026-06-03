import { StyleSheet, View } from 'react-native'

type Props = {
  progress: number
  color?: string
}

export function ProgressBar({ progress, color = '#2563eb' }: Props) {
  const clamped = Math.max(0, Math.min(100, progress))

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${clamped}%` as `${number}%`, backgroundColor: color }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
})
