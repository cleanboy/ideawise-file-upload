import * as FileSystem from 'expo-file-system/legacy'

export async function writeChunkToTemp(
  fileUri: string,
  position: number,
  length: number,
): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
    position,
    length,
  })
  const tempUri = `${FileSystem.cacheDirectory ?? ''}chunk_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`
  await FileSystem.writeAsStringAsync(tempUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  })
  return tempUri
}
