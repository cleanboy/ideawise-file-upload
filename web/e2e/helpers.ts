import type { Page, Route } from '@playwright/test'

export const API = 'http://localhost:8080'

// ─── Session factory ──────────────────────────────────────────────────────────

export type SessionOverrides = {
  uploadId?: string
  filename?: string
  mimeType?: string
  fileSize?: number
  chunkSize?: number
  totalChunks?: number
  uploadedChunks?: number[]
  uploadedChunkCount?: number
  progress?: number
  status?: 'initiated' | 'uploading' | 'completed' | 'cancelled' | 'failed'
  completedAt?: string | null
}

export function makeSession(overrides: SessionOverrides = {}) {
  return {
    uploadId: 'upload-1',
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 512,
    chunkSize: 1024 * 1024,
    totalChunks: 1,
    uploadedChunks: [],
    uploadedChunkCount: 0,
    progress: 0,
    status: 'initiated' as const,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    completedAt: null,
    ...overrides,
  }
}

// ─── Route helpers ────────────────────────────────────────────────────────────

/** Mock the full happy-path upload: initiate → chunk → finalize. */
export async function mockSuccessfulUpload(page: Page) {
  await page.route(`${API}/api/upload/initiate`, (route) =>
    route.fulfill({ json: makeSession() }),
  )
  await page.route(`${API}/api/upload/chunk`, (route) =>
    route.fulfill({
      json: makeSession({ uploadedChunkCount: 1, progress: 100, status: 'uploading' }),
    }),
  )
  await page.route(`${API}/api/upload/finalize`, (route) =>
    route.fulfill({
      json: makeSession({ status: 'completed', progress: 100, completedAt: '2026-01-01T00:01:00Z' }),
    }),
  )
}

/**
 * Mock the chunk route to block until `unblock()` is called, then respond.
 * Use this to pause/cancel an in-progress upload before it completes.
 */
export function blockingChunkRoute(page: Page) {
  let unblock!: () => void
  const gate = new Promise<void>((resolve) => {
    unblock = resolve
  })

  page.route(`${API}/api/upload/chunk`, async (route: Route) => {
    await gate
    await route.fulfill({
      json: makeSession({ uploadedChunkCount: 1, progress: 100, status: 'uploading' }),
    })
  })

  return unblock
}

// ─── File helpers ─────────────────────────────────────────────────────────────

/** Create an array of file descriptors for Playwright's setInputFiles. */
export function makeFiles(count: number, name = 'photo', type = 'image/jpeg') {
  return Array.from({ length: count }, (_, i) => ({
    name: count === 1 ? `${name}.jpg` : `${name}-${i + 1}.jpg`,
    mimeType: type,
    buffer: Buffer.from(`fake-content-${i}`),
  }))
}

/** Queue one image file via the hidden file input. */
export async function queueFile(page: Page, fileName = 'photo.jpg', type = 'image/jpeg') {
  await page.setInputFiles('input[type="file"]', {
    name: fileName,
    mimeType: type,
    buffer: Buffer.from('fake-image-data'),
  })
}
