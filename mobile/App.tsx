import * as ImagePicker from 'expo-image-picker'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { registerBackgroundUploadTask } from './src/background/uploadTask'
import { HistoryModal } from './src/components/HistoryModal'
import { UploadCard } from './src/components/UploadCard'
import { useUploadHistory } from './src/hooks/useUploadHistory'
import { useUploads } from './src/hooks/useUploads'
import type { UploadItem } from './src/types/uploads'

const STARTABLE = new Set(['queued', 'paused', 'failed'])
type TerminalStatus = 'completed' | 'cancelled' | 'failed'
const TERMINAL: TerminalStatus[] = ['completed', 'cancelled', 'failed']

function isTerminal(s: string): s is TerminalStatus {
  return (TERMINAL as string[]).includes(s)
}

export default function App() {
  const { uploads, queueFiles, startUpload, pauseItem, cancelItem, removeItem } = useUploads()
  const { history, addEntry, clear: clearHistory } = useUploadHistory()
  const [historyVisible, setHistoryVisible] = useState(false)
  const savedToHistory = useRef(new Set<string>())

  useEffect(() => {
    void registerBackgroundUploadTask()
  }, [])

  // Save terminal uploads to history
  useEffect(() => {
    uploads.forEach((item) => {
      if (savedToHistory.current.has(item.id)) return
      if (!isTerminal(item.status)) return
      savedToHistory.current.add(item.id)
      addEntry({
        id: item.id,
        name: item.file.name,
        size: item.file.size,
        type: item.file.type,
        status: item.status,
        uploadId: item.session?.uploadId,
        savedAt: Date.now(),
        error: item.error,
      })
    })
  }, [uploads, addEntry])

  async function pickFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1,
      exif: false,
    })

    if (!result.canceled) {
      queueFiles(
        result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName ?? `media_${Date.now()}`,
          size: asset.fileSize ?? 0,
          type: asset.mimeType ?? 'application/octet-stream',
          width: asset.width ?? undefined,
          height: asset.height ?? undefined,
          duration: asset.duration ?? undefined,
        })),
      )
    }
  }

  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow camera access.')
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 1,
    })

    if (!result.canceled) {
      const asset = result.assets[0]
      queueFiles([
        {
          uri: asset.uri,
          name: asset.fileName ?? `capture_${Date.now()}`,
          size: asset.fileSize ?? 0,
          type: asset.mimeType ?? 'application/octet-stream',
          width: asset.width ?? undefined,
          height: asset.height ?? undefined,
          duration: asset.duration ?? undefined,
        },
      ])
    }
  }

  function uploadAll() {
    uploads
      .filter((u) => STARTABLE.has(u.status))
      .forEach((u) => void startUpload(u))
  }

  const pendingCount = uploads.filter((u) => STARTABLE.has(u.status)).length

  const renderItem = ({ item }: { item: UploadItem }) => (
    <UploadCard
      item={item}
      onStart={() => void startUpload(item)}
      onPause={() => pauseItem(item)}
      onCancel={() => void cancelItem(item)}
      onRemove={() => void removeItem(item)}
    />
  )

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />

        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Media File Upload</Text>
            <Text style={styles.title}>Mobile Uploader</Text>
          </View>
          <TouchableOpacity style={styles.historyBtn} onPress={() => setHistoryVisible(true)}>
            <Text style={styles.historyBtnText}>History</Text>
            {history.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{history.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.pickerRow}>
          <TouchableOpacity style={styles.pickerBtn} onPress={() => void pickFromGallery()}>
            <Text style={styles.pickerBtnText}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pickerBtn} onPress={() => void pickFromCamera()}>
            <Text style={styles.pickerBtnText}>Camera</Text>
          </TouchableOpacity>
          {pendingCount > 0 && (
            <TouchableOpacity style={[styles.pickerBtn, styles.uploadAllBtn]} onPress={uploadAll}>
              <Text style={styles.pickerBtnText}>Upload all ({pendingCount})</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={uploads}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Pick files from your gallery or camera to get started.</Text>
            </View>
          }
        />

        <HistoryModal
          visible={historyVisible}
          entries={history}
          onClear={clearHistory}
          onClose={() => setHistoryVisible(false)}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563eb',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  historyBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  badge: {
    backgroundColor: '#2563eb',
    borderRadius: 99,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  pickerRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  pickerBtn: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  uploadAllBtn: {
    backgroundColor: '#059669',
  },
  pickerBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  empty: {
    paddingTop: 60,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
})
