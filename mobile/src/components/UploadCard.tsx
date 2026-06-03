import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { UploadItem } from '../types/uploads'
import { formatBytes } from '../utils/formatBytes'
import { ProgressBar } from './ProgressBar'
import { StatusBadge } from './StatusBadge'

type Props = {
  item: UploadItem
  onStart: () => void
  onPause: () => void
  onCancel: () => void
  onRemove: () => void
}

const STARTABLE = new Set(['queued', 'paused', 'failed'])
const CANCELLABLE = new Set(['queued', 'uploading', 'paused'])
const isImage = (type: string) => type.startsWith('image/')

export function UploadCard({ item, onStart, onPause, onCancel, onRemove }: Props) {
  const showProgress = item.status === 'uploading' || item.status === 'paused'

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {isImage(item.file.type) ? (
          <Image source={{ uri: item.file.uri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.videoThumb]}>
            <Text style={styles.videoIcon}>▶</Text>
          </View>
        )}

        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={1}>{item.file.name}</Text>
          <Text style={styles.sub}>{formatBytes(item.file.size)} · {item.file.type.split('/')[0]}</Text>
          <StatusBadge status={item.status} />
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

      <View style={styles.actions}>
        {STARTABLE.has(item.status) && (
          <TouchableOpacity style={styles.btn} onPress={onStart}>
            <Text style={styles.btnText}>
              {item.status === 'paused' ? 'Resume' : item.status === 'failed' ? 'Retry' : 'Upload'}
            </Text>
          </TouchableOpacity>
        )}

        {item.status === 'uploading' && (
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onPause}>
            <Text style={[styles.btnText, styles.btnTextSecondary]}>Pause</Text>
          </TouchableOpacity>
        )}

        {CANCELLABLE.has(item.status) && (
          <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={onCancel}>
            <Text style={[styles.btnText, styles.btnTextDanger]}>Cancel</Text>
          </TouchableOpacity>
        )}

        {!CANCELLABLE.has(item.status) && (
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onRemove}>
            <Text style={[styles.btnText, styles.btnTextSecondary]}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>
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
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
  },
  videoThumb: {
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoIcon: {
    color: '#fff',
    fontSize: 18,
  },
  meta: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  sub: {
    fontSize: 12,
    color: '#6b7280',
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
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  btn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  btnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  btnSecondary: {
    backgroundColor: '#f3f4f6',
  },
  btnTextSecondary: {
    color: '#374151',
  },
  btnDanger: {
    backgroundColor: '#fee2e2',
  },
  btnTextDanger: {
    color: '#b91c1c',
  },
})
