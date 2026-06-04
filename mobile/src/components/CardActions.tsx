import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { UploadStatus } from '../types/uploads'
import { CANCELLABLE, STARTABLE } from '../utils/uploadStatus'

type Props = {
  status: UploadStatus
  onStart: () => void
  onPause: () => void
  onCancel: () => void
  onRemove: () => void
}

export function CardActions({ status, onStart, onPause, onCancel, onRemove }: Props) {
  return (
    <View style={styles.actions}>
      {STARTABLE.has(status) && (
        <TouchableOpacity style={styles.btn} onPress={onStart}>
          <Text style={styles.btnText}>
            {status === 'paused' ? 'Resume' : status === 'failed' ? 'Retry' : 'Upload'}
          </Text>
        </TouchableOpacity>
      )}

      {status === 'uploading' && (
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onPause}>
          <Text style={[styles.btnText, styles.btnTextSecondary]}>Pause</Text>
        </TouchableOpacity>
      )}

      {CANCELLABLE.has(status) && (
        <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={onCancel}>
          <Text style={[styles.btnText, styles.btnTextDanger]}>Cancel</Text>
        </TouchableOpacity>
      )}

      {!CANCELLABLE.has(status) && (
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onRemove}>
          <Text style={[styles.btnText, styles.btnTextSecondary]}>Remove</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
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
