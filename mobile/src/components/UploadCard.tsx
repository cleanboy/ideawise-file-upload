import { StyleSheet, Text, View } from 'react-native'
import type { UploadItem } from '../types/uploads'
import { formatBytes } from '../utils/formatBytes'
import { formatDuration } from '../utils/formatDuration'
import { ProgressBar } from './ProgressBar'
import { StatusBadge } from './StatusBadge'
import { MediaThumbnail } from './MediaThumbnail'
import { CardActions } from './CardActions'

type Props = {
  item: UploadItem
  onStart: () => void
  onPause: () => void
  onCancel: () => void
  onRemove: () => void
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={metaRow.row}>
      <Text style={metaRow.label}>{label}</Text>
      <Text style={metaRow.value}>{value}</Text>
    </View>
  )
}

const metaRow = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  label: { fontSize: 11, color: '#9ca3af', fontWeight: '500', width: 68 },
  value: { fontSize: 11, color: '#374151', fontWeight: '500', flexShrink: 1 },
})

export function UploadCard({ item, onStart, onPause, onCancel, onRemove }: Props) {
  const showProgress = item.status === 'uploading' || item.status === 'paused'

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <MediaThumbnail file={item.file} />

        <View style={styles.meta}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{item.file.name}</Text>
            <StatusBadge status={item.status} />
          </View>
          <View style={styles.metaRows}>
            <MetaRow label="Type" value={item.file.name.split('.').pop()?.toUpperCase() || item.file.type.split('/')[0]} />
            <MetaRow label="Size" value={formatBytes(item.file.size)} />
            {item.file.width != null && item.file.height != null && (
              <MetaRow label="Resolution" value={`${item.file.width} × ${item.file.height}`} />
            )}
            {item.file.duration != null && (
              <MetaRow label="Duration" value={formatDuration(item.file.duration / 1000)} />
            )}
            <MetaRow label="Chunks" value={`${item.uploadedChunks} / ${item.totalChunks}`} />
          </View>
        </View>
      </View>

      {showProgress && (
        <View style={styles.progressRow}>
          <ProgressBar
            progress={item.progress}
            color={item.status === 'paused' ? '#ca8a04' : '#2563eb'}
          />
          <Text style={styles.progressText}>
            {item.uploadedChunks}/{item.totalChunks} chunks · {Math.round(item.progress)}%
          </Text>
        </View>
      )}

      {item.error != null && (
        <Text style={styles.error} numberOfLines={2}>{item.error}</Text>
      )}

      <CardActions
        status={item.status}
        onStart={onStart}
        onPause={onPause}
        onCancel={onCancel}
        onRemove={onRemove}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  meta: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },
  metaRows: {
    gap: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  progressRow: {
    marginTop: 10,
    gap: 4,
  },
  progressText: {
    fontSize: 11,
    color: '#6b7280',
  },
  error: {
    fontSize: 12,
    color: '#b91c1c',
    marginTop: 6,
  },
})
