import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import {
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
import { useFilePicker } from './src/hooks/useFilePicker'
import { useHistorySync } from './src/hooks/useHistorySync'
import { useUploadHistory } from './src/hooks/useUploadHistory'
import { useUploads } from './src/hooks/useUploads'
import { STARTABLE } from './src/utils/uploadStatus'
import type { UploadItem } from './src/types/uploads'

export default function App() {
  const { uploads, queueFiles, startUpload, pauseItem, cancelItem, removeItem } = useUploads()
  const { history, addEntry, clear: clearHistory } = useUploadHistory()
  const { pickFromGallery, pickFromCamera } = useFilePicker(queueFiles)
  const [historyVisible, setHistoryVisible] = useState(false)

  useEffect(() => { void registerBackgroundUploadTask() }, [])
  useHistorySync(uploads, addEntry)

  function uploadAll() {
    uploads.filter((u) => STARTABLE.has(u.status)).forEach((u) => void startUpload(u))
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
