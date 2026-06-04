import { Ionicons } from '@expo/vector-icons'
import * as VideoThumbnails from 'expo-video-thumbnails'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useEffect, useState } from 'react'
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View, SafeAreaView } from 'react-native'
import type { UploadItem } from '../types/uploads'
import { formatBytes } from '../utils/formatBytes'
import { formatDuration } from '../utils/formatDuration'
import { CANCELLABLE, STARTABLE } from '../utils/uploadStatus'
import { ProgressBar } from './ProgressBar'
import { StatusBadge } from './StatusBadge'

type Props = {
  item: UploadItem
  onStart: () => void
  onPause: () => void
  onCancel: () => void
  onRemove: () => void
}
const isVideo = (type: string) => type.startsWith('video/')
const isImage = (type: string) => type.startsWith('image/')

function VideoPreviewModal({ uri, onClose }: { uri: string; onClose: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false
    p.play()
  })

  return (
    <Modal animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={preview.container}>
        <VideoView player={player} style={preview.video} allowsFullscreen contentFit="contain" />
        <TouchableOpacity style={preview.closeBtn} onPress={onClose}>
          <Text style={preview.closeText}>✕</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  )
}

const preview = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1 },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})

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
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const showProgress = item.status === 'uploading' || item.status === 'paused'

  useEffect(() => {
    if (!isVideo(item.file.type)) return
    VideoThumbnails.getThumbnailAsync(item.file.uri, { time: 0, quality: 0.6 })
      .then(({ uri }) => setThumbnailUri(uri))
      .catch(() => {})
  }, [item.file.uri, item.file.type])

  function renderThumb() {
    if (isImage(item.file.type)) {
      return (
        <TouchableOpacity onPress={() => setPreviewOpen(true)}>
          <Image source={{ uri: item.file.uri }} style={styles.thumb} />
        </TouchableOpacity>
      )
    }

    return (
      <TouchableOpacity style={styles.thumb} onPress={() => setPreviewOpen(true)}>
        {thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.videoThumb]} />
        )}
        <View style={styles.playOverlay}>
          <Ionicons name="play" size={18} color="#fff" />
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {renderThumb()}

        <View style={styles.meta}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{item.file.name}</Text>
            <StatusBadge status={item.status} />
          </View>
          <View style={styles.metaRows}>
            <MetaRow label="Type" value={item.file.name.split('.').pop()?.toUpperCase() ?? item.file.type.split('/')[0]} />
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

      {previewOpen && isVideo(item.file.type) && (
        <VideoPreviewModal uri={item.file.uri} onClose={() => setPreviewOpen(false)} />
      )}

      {previewOpen && isImage(item.file.type) && (
        <Modal animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setPreviewOpen(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
            <Image
              source={{ uri: item.file.uri }}
              style={{ flex: 1 }}
              resizeMode="contain"
            />
            <TouchableOpacity
              style={preview.closeBtn}
              onPress={() => setPreviewOpen(false)}
            >
              <Text style={preview.closeText}>✕</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </Modal>
      )}
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
    width: 104,
    height: 104,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1e293b',
  },
  videoThumb: {
    backgroundColor: '#1e293b',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
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
