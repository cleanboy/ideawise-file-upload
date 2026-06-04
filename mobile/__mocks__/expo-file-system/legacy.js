module.exports = {
  readAsStringAsync: jest.fn().mockResolvedValue(''),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  uploadAsync: jest.fn().mockResolvedValue({ status: 200, body: '' }),
  cacheDirectory: '/tmp/expo-cache/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  FileSystemUploadType: { MULTIPART: 'MULTIPART', BINARY_CONTENT: 'BINARY_CONTENT' },
}
