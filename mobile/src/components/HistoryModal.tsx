import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import type { HistoryEntry } from '../utils/uploadHistory'
import { formatBytes } from '../utils/formatBytes'
import { formatTimeAgo } from '../utils/formatTimeAgo'

type Props = {
  visible: boolean
  entries: HistoryEntry[]
  onClear: () => void
  onClose: () => void
}

const STATUS_COLOR: Record<HistoryEntry['status'], string> = {
  completed: '#15803d',
  cancelled: '#6b7280',
  failed: '#b91c1c',
}

export function HistoryModal({ visible, entries, onClear, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Upload History</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Done</Text>
          </TouchableOpacity>
        </View>

        {entries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No uploads yet.</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity style={styles.clearBtn} onPress={onClear}>
              <Text style={styles.clearText}>Clear history</Text>
            </TouchableOpacity>
            <ScrollView contentContainerStyle={styles.list}>
              {entries.map((entry) => (
                <View key={entry.id} style={styles.row}>
                  <View style={styles.rowMeta}>
                    <Text style={styles.rowName} numberOfLines={1}>{entry.name}</Text>
                    <Text style={styles.rowSub}>
                      {formatBytes(entry.size)} · {formatTimeAgo(entry.savedAt)}
                    </Text>
                    {entry.error != null && (
                      <Text style={styles.rowError} numberOfLines={1}>{entry.error}</Text>
                    )}
                  </View>
                  <Text style={[styles.rowStatus, { color: STATUS_COLOR[entry.status] }]}>
                    {entry.status}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  closeBtn: {
    paddingHorizontal: 4,
  },
  closeText: {
    fontSize: 16,
    color: '#2563eb',
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 15,
  },
  clearBtn: {
    alignSelf: 'flex-end',
    margin: 12,
  },
  clearText: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
    gap: 8,
  },
  rowMeta: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  rowSub: {
    fontSize: 12,
    color: '#6b7280',
  },
  rowError: {
    fontSize: 11,
    color: '#b91c1c',
  },
  rowStatus: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
})
