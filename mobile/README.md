# Mobile App

React Native (Expo SDK 56) mobile client for the Media File Upload System.

> **Note:** This app uses native modules (`expo-notifications`, `expo-background-task`, `expo-camera`) that are not available in the standard Expo Go client. A **development build** is required.

---

## Prerequisites

| Tool | Required for |
|---|---|
| Node.js 18+ | All platforms |
| Java JDK 17 | Android builds |
| Android Studio | Android emulator + SDK |
| Xcode 15+ | iOS simulator (macOS only) |

### Install Java (Android only)

```bash
brew install --cask zulu@17
echo 'export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home' >> ~/.zshrc
echo 'export ANDROID_HOME=$HOME/Library/Android/sdk' >> ~/.zshrc
echo 'export PATH=$PATH:$ANDROID_HOME/platform-tools' >> ~/.zshrc
source ~/.zshrc
```

---

## First-Time Setup

### 1. Install dependencies

```bash
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` is required due to a peer dependency conflict between `react@19` and `@testing-library/jest-native@5`.

### 2. Configure the API URL

Create a `.env` file in the `mobile/` directory:

```
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080
```

| Scenario | URL |
|---|---|
| Android emulator → host machine | `http://10.0.2.2:8080` |
| iOS simulator → host machine | `http://localhost:8080` |
| Physical device → host machine | `http://<your-local-IP>:8080` |

### 3. Build and install the development build

This compiles the native layer and installs it on your device or emulator. Only needed once (or when native dependencies change).

**Android** (requires an emulator running or a device connected via USB with debugging enabled):

```bash
npm run android
```

**iOS** (macOS only, requires Xcode):

```bash
npm run ios
```

The first build takes several minutes. Once complete the app is installed on the target device.

### 4. Subsequent development sessions

After the initial build, start the Metro bundler only:

```bash
npx expo start --dev-client
```

The installed dev build on your device will connect to Metro automatically.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run android` | Build and run on Android emulator/device |
| `npm run ios` | Build and run on iOS simulator/device |
| `npm start` | Start Metro bundler (dev build must already be installed) |
| `npm test` | Run unit tests (Jest) |
| `npm run test:watch` | Run tests in watch mode |

---

## Architecture

```
mobile/
├── App.tsx                     # Root component — composes hooks, renders layout
├── src/
│   ├── api/
│   │   └── uploads.ts          # HTTP calls to the backend
│   ├── background/
│   │   └── uploadTask.ts       # expo-background-task definition + registration
│   ├── components/
│   │   ├── CardActions.tsx     # Upload action buttons (start/pause/cancel/remove)
│   │   ├── HistoryModal.tsx    # Upload history modal
│   │   ├── MediaThumbnail.tsx  # Image/video thumbnail + full-screen preview modal
│   │   ├── ProgressBar.tsx     # Reusable progress bar
│   │   ├── StatusBadge.tsx     # Coloured status chip
│   │   └── UploadCard.tsx      # Per-file card with metadata, progress, actions
│   ├── hooks/
│   │   ├── useAppStateUpload.ts  # Auto-resume uploads when app returns to foreground
│   │   ├── useFilePicker.ts      # Gallery + camera picker with permission handling
│   │   ├── useHistorySync.ts     # Moves terminal uploads into history
│   │   ├── useNotifications.ts   # Permission request + completion notification helper
│   │   ├── useUploadHistory.ts   # AsyncStorage-backed upload history
│   │   └── useUploads.ts         # Core upload state machine + chunked upload logic
│   ├── types/
│   │   └── uploads.ts
│   └── utils/
│       ├── fileChunk.ts          # Read a file slice and write it to a temp path
│       ├── formatBytes.ts
│       ├── formatDuration.ts
│       ├── sleep.ts
│       ├── uploadHistory.ts      # AsyncStorage helpers for history persistence
│       ├── uploadQueue.ts        # AsyncStorage helpers for queue persistence
│       └── uploadStatus.ts       # STARTABLE / CANCELLABLE sets + isTerminal
```

---

## Key Design Decisions

**Chunked upload flow** — identical to the web client: initiate → parallel chunk workers (max 3 per file, max 3 concurrent files) → finalize. Each chunk is retried up to 3 times with exponential backoff.

**Queue persistence** — `useUploads` persists the upload queue to AsyncStorage on every state change (only non-terminal items). On app restart, the queue is restored and any item that was `uploading` is marked `paused` so the user can choose to resume.

**Background uploads** — when the app is minimised, uploads continue running until the Android OS suspends or kills the process (typically several minutes on a real device). The `expo-background-task` scheduled task fires periodically and will process any remaining queued or paused items using the same chunk upload logic. When the app returns to the foreground, `useAppStateUpload` auto-resumes any paused items.

> **Platform note:** On iOS the JavaScript thread is suspended immediately when the app is backgrounded, so in-flight uploads are interrupted. True iOS background uploading requires `NSURLSession` background transfers, which would require replacing the chunked fetch-based approach with a native upload session. This is a known architectural limitation.

**Completion notifications** — `expo-notifications` fires a local system notification each time an upload reaches `completed` status, whether the app is in the foreground or background.

---

## Permissions

| Permission | When requested | Why |
|---|---|---|
| Media library | First gallery pick | Read selected files |
| Camera | First camera capture | Capture photo/video |
| Notifications | App startup | Upload completion alerts |

---

## Troubleshooting

**`PluginError: Failed to resolve plugin for module "expo-dev-client"`**
Node modules are not installed. Run `npm install --legacy-peer-deps`.

**`No development build installed`**
The dev build hasn't been built yet. Run `npm run android` or `npm run ios` to compile and install it.

**`SDK location not found`**
`ANDROID_HOME` is not set or `android/local.properties` is missing. Either set the environment variable or create the file manually:
```
sdk.dir=/Users/<you>/Library/Android/sdk
```

**`Unable to locate a Java Runtime`**
JDK 17 is not installed or `JAVA_HOME` is not set. Follow the Java install steps above.

**`ERESOLVE` during npm install**
Use `--legacy-peer-deps`. This is a known conflict between `react@19` and `@testing-library/jest-native@5`.
