import { test, expect } from '@playwright/test'
import {
  API,
  makeSession,
  makeFiles,
  mockSuccessfulUpload,
  blockingChunkRoute,
  queueFile,
} from './helpers'

// ─── App shell ────────────────────────────────────────────────────────────────

test.describe('App shell', () => {
  test('renders the heading and drop zone on load', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Web uploader' })).toBeVisible()
    await expect(page.locator('.drop-zone')).toBeVisible()
    await expect(page.getByText('Drop files here or choose files')).toBeVisible()
  })

  test('shows the empty state in the upload list', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('No files queued.')).toBeVisible()
  })
})

// ─── File queuing ─────────────────────────────────────────────────────────────

test.describe('File queuing', () => {
  test('queues a valid image file via the file input', async ({ page }) => {
    await page.goto('/')
    await queueFile(page, 'photo.jpg', 'image/jpeg')

    const card = page.locator('article').filter({ hasText: 'photo.jpg' })
    await expect(card).toBeVisible()
    await expect(card.locator('.status--queued')).toBeVisible()
  })

  test('queues a valid video file via the file input', async ({ page }) => {
    await page.goto('/')
    await queueFile(page, 'clip.mp4', 'video/mp4')

    await expect(page.locator('.status--queued')).toBeVisible()
  })

  test('queues multiple files and prepends newest first', async ({ page }) => {
    await page.goto('/')
    await queueFile(page, 'first.jpg', 'image/jpeg')
    await queueFile(page, 'second.jpg', 'image/jpeg')

    const cards = page.locator('article')
    await expect(cards.nth(0)).toContainText('second.jpg')
    await expect(cards.nth(1)).toContainText('first.jpg')
  })

  test('shows the file extension in the metadata', async ({ page }) => {
    await page.goto('/')
    await queueFile(page, 'photo.jpg', 'image/jpeg')

    await expect(page.locator('article').filter({ hasText: 'photo.jpg' })).toContainText('JPG')
  })

  test('removes the empty state once files are queued', async ({ page }) => {
    await page.goto('/')
    await queueFile(page)
    await expect(page.getByText('No files queued.')).not.toBeVisible()
  })
})

// ─── File validation ──────────────────────────────────────────────────────────

test.describe('File validation', () => {
  test('rejects a file with an unsupported MIME type', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', {
      name: 'doc.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('fake pdf'),
    })

    const card = page.locator('article').filter({ hasText: 'doc.pdf' })
    await expect(card.locator('.status--rejected')).toBeVisible()
    await expect(card).toContainText('Invalid file type')
  })

  test('rejects every file beyond the 10-file per-selection limit', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', makeFiles(11))

    // Files 1–10 should be queued; file 11 should be rejected
    await expect(page.locator('.status--queued')).toHaveCount(10)
    await expect(page.locator('.status--rejected')).toHaveCount(1)
    await expect(page.locator('article').last()).toContainText('10-file limit')
  })

  test('accepts exactly 10 files with no rejections', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', makeFiles(10))

    await expect(page.locator('.status--queued')).toHaveCount(10)
    await expect(page.locator('.status--rejected')).toHaveCount(0)
  })
})

// ─── Upload lifecycle ─────────────────────────────────────────────────────────

test.describe('Upload lifecycle', () => {
  test('full upload: queued → uploading → completed', async ({ page }) => {
    await page.goto('/')
    await mockSuccessfulUpload(page)

    await queueFile(page)
    await page.getByRole('button', { name: 'Start', exact: true }).click()

    await expect(page.locator('.status--completed')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled()
  })

  test('shows uploading status while the upload is in progress', async ({ page }) => {
    await page.goto('/')
    await page.route(`${API}/api/upload/initiate`, (route) =>
      route.fulfill({ json: makeSession() }),
    )
    const unblock = blockingChunkRoute(page)

    await queueFile(page)
    await page.getByRole('button', { name: 'Start', exact: true }).click()

    await expect(page.locator('.status--uploading')).toBeVisible()

    unblock()
    await page.route(`${API}/api/upload/finalize`, (route) =>
      route.fulfill({ json: makeSession({ status: 'completed' }) }),
    )
    await expect(page.locator('.status--completed')).toBeVisible()
  })

  test('sets status to failed when the API returns an error', async ({ page }) => {
    await page.goto('/')
    await page.route(`${API}/api/upload/initiate`, (route) =>
      route.fulfill({
        status: 500,
        json: { error: { message: 'Storage unavailable' } },
      }),
    )

    await queueFile(page)
    await page.getByRole('button', { name: 'Start', exact: true }).click()

    await expect(page.locator('.status--failed')).toBeVisible()
    await expect(page.locator('article')).toContainText('Storage unavailable')
  })

  test('retry: starts a fresh upload after a previous failure', async ({ page }) => {
    await page.goto('/')

    // First attempt → fails
    await page.route(`${API}/api/upload/initiate`, (route) =>
      route.fulfill({ status: 500, json: { error: { message: 'Oops' } } }),
    )
    await queueFile(page)
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.locator('.status--failed')).toBeVisible()

    // Second attempt → succeeds
    await page.unroute(`${API}/api/upload/initiate`)
    await mockSuccessfulUpload(page)

    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.locator('.status--completed')).toBeVisible()
  })
})

// ─── Pause and resume ─────────────────────────────────────────────────────────

test.describe('Pause and resume', () => {
  test('pauses an in-progress upload', async ({ page }) => {
    await page.goto('/')
    await page.route(`${API}/api/upload/initiate`, (route) =>
      route.fulfill({ json: makeSession() }),
    )
    const unblock = blockingChunkRoute(page)

    await queueFile(page)
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.locator('.status--uploading')).toBeVisible()

    await page.getByRole('button', { name: 'Pause' }).click()
    await expect(page.locator('.status--paused')).toBeVisible()

    unblock() // let the in-flight request finish gracefully
  })

  test('resumes a paused upload and completes it', async ({ page }) => {
    await page.goto('/')
    await page.route(`${API}/api/upload/initiate`, (route) =>
      route.fulfill({ json: makeSession() }),
    )
    const unblock = blockingChunkRoute(page)

    await queueFile(page)
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.locator('.status--uploading')).toBeVisible()

    await page.getByRole('button', { name: 'Pause' }).click()
    await expect(page.locator('.status--paused')).toBeVisible()

    unblock()

    // Re-mock the chunk and finalize for the resumed upload
    await page.route(`${API}/api/upload/status/upload-1`, (route) =>
      route.fulfill({
        json: makeSession({ status: 'uploading', uploadedChunks: [], uploadedChunkCount: 0 }),
      }),
    )
    await page.route(`${API}/api/upload/chunk`, (route) =>
      route.fulfill({
        json: makeSession({ uploadedChunkCount: 1, progress: 100, status: 'uploading' }),
      }),
    )
    await page.route(`${API}/api/upload/finalize`, (route) =>
      route.fulfill({ json: makeSession({ status: 'completed' }) }),
    )

    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(page.locator('.status--completed')).toBeVisible()
  })
})

// ─── Cancel ───────────────────────────────────────────────────────────────────

test.describe('Cancel', () => {
  test('cancels a queued file without calling the API', async ({ page }) => {
    await page.goto('/')
    await queueFile(page)

    const cancelRequest = page.waitForRequest(`${API}/api/upload/cancel/**`, { timeout: 1000 })

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('.status--cancelled')).toBeVisible()

    // No cancel API call should have been made
    await expect(cancelRequest).rejects.toThrow()
  })

  test('cancels a mid-upload file and calls the cancel API', async ({ page }) => {
    await page.goto('/')
    await page.route(`${API}/api/upload/initiate`, (route) =>
      route.fulfill({ json: makeSession() }),
    )
    const unblock = blockingChunkRoute(page)
    await page.route(`${API}/api/upload/cancel/upload-1`, (route) =>
      route.fulfill({ json: makeSession({ status: 'cancelled' }) }),
    )

    await queueFile(page)
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.locator('.status--uploading')).toBeVisible()

    const cancelRequest = page.waitForRequest(`${API}/api/upload/cancel/upload-1`)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await cancelRequest
    await expect(page.locator('.status--cancelled')).toBeVisible()

    unblock()
  })
})

// ─── Remove ───────────────────────────────────────────────────────────────────

test.describe('Remove', () => {
  test('removes a queued file from the list without calling the API', async ({ page }) => {
    await page.goto('/')
    await queueFile(page, 'photo.jpg')

    const deleteRequest = page.waitForRequest(`${API}/api/upload/**`, { timeout: 1000 })
    await page.getByRole('button', { name: 'Remove' }).click()

    await expect(page.locator('article').filter({ hasText: 'photo.jpg' })).not.toBeVisible()
    await expect(page.getByText('No files queued.')).toBeVisible()
    await expect(deleteRequest).rejects.toThrow()
  })

  test('removes a failed upload (has a session) and calls the delete API', async ({ page }) => {
    // A failed upload still has a session from the initiate call, so removeItem calls
    // deleteUpload. Patch window.setTimeout so the retry backoff (~3.5 s) becomes instant.
    await page.addInitScript(() => {
      const orig = window.setTimeout
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.setTimeout = (fn, delay, ...args) => orig(fn, delay > 100 ? 0 : delay, ...args)
    })

    await page.goto('/')
    await page.route(`${API}/api/upload/initiate`, (route) =>
      route.fulfill({ json: makeSession() }),
    )
    await page.route(`${API}/api/upload/chunk`, (route) =>
      route.fulfill({ status: 500, json: { error: { message: 'Network error' } } }),
    )
    // Route for DELETE /api/upload/upload-1 (the exact URL, not a glob)
    await page.route(`${API}/api/upload/upload-1`, (route) =>
      route.fulfill({ status: 204, body: '' }),
    )

    await queueFile(page, 'photo.jpg')
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    // Allow up to 10 s: addInitScript makes sleeps instant but the fallback is 3.5 s real time
    await expect(page.locator('.status--failed')).toBeVisible({ timeout: 10_000 })

    const deleteRequest = page.waitForRequest(
      (req) => req.url().includes('/api/upload/upload-1') && req.method() === 'DELETE',
    )
    await page.getByRole('button', { name: 'Remove' }).click()
    await deleteRequest

    await expect(page.locator('article').filter({ hasText: 'photo.jpg' })).not.toBeVisible()
  })
})

// ─── Multi-file selection ─────────────────────────────────────────────────────

test.describe('Multi-file selection', () => {
  test('select-all checkbox selects all queued files', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', makeFiles(3))

    await page.getByLabel('Select all').check()

    // All 3 checkboxes on the cards should be checked
    await expect(page.locator('article input[type="checkbox"]')).toHaveCount(3)
    for (const checkbox of await page.locator('article input[type="checkbox"]').all()) {
      await expect(checkbox).toBeChecked()
    }
  })

  test('deselect-all unchecks all cards', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', makeFiles(2))

    // Select all then deselect all
    await page.getByLabel('Select all').check()
    await expect(page.locator('text=Deselect all')).toBeVisible()
    await page.locator('label.select-all input').click()

    for (const checkbox of await page.locator('article input[type="checkbox"]').all()) {
      await expect(checkbox).not.toBeChecked()
    }
  })

  test('Start Selected uploads only the selected files', async ({ page }) => {
    // Mock two separate upload sessions so both can complete independently
    let initiateCount = 0
    await page.route(`${API}/api/upload/initiate`, (route) => {
      initiateCount++
      route.fulfill({ json: makeSession({ uploadId: `upload-${initiateCount}` }) })
    })
    await page.route(`${API}/api/upload/chunk`, (route) =>
      route.fulfill({ json: makeSession({ uploadedChunkCount: 1, progress: 100 }) }),
    )
    await page.route(`${API}/api/upload/finalize`, (route) =>
      route.fulfill({ json: makeSession({ status: 'completed' }) }),
    )

    await page.goto('/')
    await page.setInputFiles('input[type="file"]', makeFiles(2))

    // Select only the first card
    await page.locator('article').first().getByRole('checkbox').check()

    await page.getByRole('button', { name: 'Start Selected' }).click()

    // Only one upload should have been initiated
    await expect(page.locator('.status--completed')).toHaveCount(1)
    await expect(page.locator('.status--queued')).toHaveCount(1)
  })

  test('Start Selected button is disabled when nothing startable is selected', async ({ page }) => {
    await page.goto('/')
    await page.setInputFiles('input[type="file"]', makeFiles(1))

    // Don't select anything
    await expect(page.getByRole('button', { name: 'Start Selected' })).toBeDisabled()
  })
})

// ─── Concurrency control ──────────────────────────────────────────────────────

test.describe('Concurrency control', () => {
  test('caps simultaneous uploads at 3 — the 4th stays queued until a slot opens', async ({ page }) => {
    let unblockInitiate!: () => void
    const gate = new Promise<void>((resolve) => { unblockInitiate = resolve })

    let initiateCount = 0
    await page.route(`${API}/api/upload/initiate`, async (route) => {
      await gate
      initiateCount++
      await route.fulfill({ json: makeSession({ uploadId: `upload-${initiateCount}` }) })
    })
    await page.route(`${API}/api/upload/chunk`, (route) =>
      route.fulfill({ json: makeSession({ uploadedChunkCount: 1, progress: 100, status: 'uploading' }) }),
    )
    await page.route(`${API}/api/upload/finalize`, (route) =>
      route.fulfill({ json: makeSession({ status: 'completed' }) }),
    )

    await page.goto('/')
    await page.setInputFiles('input[type="file"]', makeFiles(4))
    await page.getByLabel('Select all').check()
    await page.getByRole('button', { name: 'Start Selected' }).click()

    // Exactly 3 uploading (blocked at initiate), 1 still queued waiting for a slot
    await expect(page.locator('.status--uploading')).toHaveCount(3)
    await expect(page.locator('.status--queued')).toHaveCount(1)

    // Unblock initiates → 4th claims the first freed slot, all 4 complete
    unblockInitiate()
    await expect(page.locator('.status--completed')).toHaveCount(4, { timeout: 10_000 })
  })
})

// ─── Drag and drop ────────────────────────────────────────────────────────────

test.describe('Drag and drop', () => {
  test('queues a file dropped onto the drop zone', async ({ page }) => {
    await page.goto('/')

    // Playwright doesn't natively support file drops, so we dispatch the event
    // with a DataTransfer built in the browser context.
    await page.locator('.drop-zone').dispatchEvent('drop', {
      dataTransfer: await page.evaluateHandle(() => {
        const dt = new DataTransfer()
        const file = new File(['fake'], 'dropped.jpg', { type: 'image/jpeg' })
        dt.items.add(file)
        return dt
      }),
    })

    await expect(page.locator('article').filter({ hasText: 'dropped.jpg' })).toBeVisible()
    await expect(page.locator('.status--queued')).toBeVisible()
  })
})
