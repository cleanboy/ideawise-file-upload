import { Ionicons } from '@expo/vector-icons'
import * as VideoThumbnails from 'expo-video-thumbnails'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useEffect, useState } from 'react'
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { MediaFile } from '../types/uploads'

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
        <VideoView player={player} style={preview.video} contentFit="contain" />
        <TouchableOpacity style={preview.closeBtn} onPress={onClose}>
          <Text style={preview.closeText}>✕</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  )
}

function ImagePreviewModal({ uri, onClose }: { uri: string; onClose: () => void }) {
  return (
    <Modal animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={preview.container}>
        <Image source={{ uri }} style={{ flex: 1 }} resizeMode="contain" />
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

export function MediaThumbnail({ file }: { file: MediaFile }) {
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    if (!isVideo(file.type)) return
    VideoThumbnails.getThumbnailAsync(file.uri, { time: 0, quality: 0.6 })
      .then(({ uri }) => setThumbnailUri(uri))
      .catch(() => {})
  }, [file.uri, file.type])

  if (isImage(file.type)) {
    return (
      <>
        <TouchableOpacity onPress={() => setPreviewOpen(true)}>
          <Image source={{ uri: file.uri }} style={styles.thumb} />
        </TouchableOpacity>
        {previewOpen && <ImagePreviewModal uri={file.uri} onClose={() => setPreviewOpen(false)} />}
      </>
    )
  }

  return (
    <>
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
      {previewOpen && <VideoPreviewModal uri={file.uri} onClose={() => setPreviewOpen(false)} />}
    </>
  )
}

const styles = StyleSheet.create({
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
})
