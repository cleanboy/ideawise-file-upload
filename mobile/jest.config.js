/** @type {import('jest-expo/jest-preset')} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/node_modules/@react-native-async-storage/async-storage/jest/async-storage-mock.js',
    '^expo-file-system/legacy$': '<rootDir>/__mocks__/expo-file-system/legacy.js',
  },
}
