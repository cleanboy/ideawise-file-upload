import * as ImagePicker from 'expo-image-picker'
import { Alert } from 'react-native'
import type { MediaFile } from '../types/uploads'

function assetToMediaFile(asset: ImagePicker.ImagePickerAsset, fallbackName: string): MediaFile {
  return {
    uri: asset.uri,
    name: asset.fileName ?? fallbackName,
    size: asset.fileSize ?? 0,
    type: asset.mimeType ?? 'application/octet-stream',
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    duration: asset.duration ?? undefined,
  }
}

export function useFilePicker(queueFiles: (files: MediaFile[]) => void) {
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
      queueFiles(result.assets.map((a) => assetToMediaFile(a, `media_${Date.now()}`)))
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
      queueFiles([assetToMediaFile(result.assets[0], `capture_${Date.now()}`)])
    }
  }

  return { pickFromGallery, pickFromCamera }
}
