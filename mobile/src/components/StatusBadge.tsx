import { StyleSheet, Text, View } from 'react-native'
import type { UploadStatus } from '../types/uploads'

const CONFIG: Record<UploadStatus, { label: string; bg: string; text: string }> = {
  queued:    { label: 'Queued',    bg: '#f3f4f6', text: '#6b7280' },
  uploading: { label: 'Uploading', bg: '#dbeafe', text: '#1d4ed8' },
  paused:    { label: 'Paused',    bg: '#fef9c3', text: '#a16207' },
  completed: { label: 'Done',      bg: '#dcfce7', text: '#15803d' },
  cancelled: { label: 'Cancelled', bg: '#f3f4f6', text: '#6b7280' },
  failed:    { label: 'Failed',    bg: '#fee2e2', text: '#b91c1c' },
  rejected:  { label: 'Rejected',  bg: '#fee2e2', text: '#b91c1c' },
}

type Props = {
  status: UploadStatus
}

export function StatusBadge({ status }: Props) {
  const { label, bg, text } = CONFIG[status]
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
})
