import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type BrowserContext, type Worker } from 'playwright'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'

const EXT_PATH = path.resolve(import.meta.dir, '..', 'dist')
const whitePngPath = path.join(import.meta.dir, '1px_white.png')

let context: BrowserContext
let sw: Worker
let profileDir: string
let server: ReturnType<typeof Bun.serve>

async function waitForServiceWorker(ctx: BrowserContext): Promise<Worker> {
	const existing = ctx.serviceWorkers()
	if (existing.length > 0) return existing[0]
	return ctx.waitForEvent('serviceworker', { timeout: 15000 })
}

beforeAll(async () => {
	// Serve the QR image over HTTP so the service worker can fetch it
	server = Bun.serve({
		port: 0,
		async fetch(req) {
			const url = new URL(req.url)
			if (url.pathname === '/qr.jpg') {
				const data = await fs.readFile(path.join(import.meta.dir, 'qr_webstore.jpg'))
				return new Response(data, { headers: { 'content-type': 'image/jpeg' } })
			}
			if (url.pathname === '/1px_white.png') {
				const data = await fs.readFile(whitePngPath)
				return new Response(data, { headers: { 'content-type': 'image/png' } })
			}
			if (url.pathname === '/') {
				return new Response(
					`<!doctype html><html><body>
					<img id="qr" src="http://localhost:${server.port}/qr.jpg" />
					</body></html>`,
					{ headers: { 'content-type': 'text/html' } },
				)
			}
			return new Response('not found', { status: 404 })
		},
	})

	// Extensions require a real user-data-dir and cannot run in headless shell
	profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qr-e2e-profile-'))

	// Launch Chrome with the built extension loaded
	context = await chromium.launchPersistentContext(profileDir, {
		headless: false,
		args: [
			'--headless=new',
			`--disable-extensions-except=${EXT_PATH}`,
			`--load-extension=${EXT_PATH}`,
		],
	})

	sw = await waitForServiceWorker(context)
})

afterAll(async () => {
	await context?.close()
	server?.stop(true)
	if (profileDir) await fs.rm(profileDir, { recursive: true, force: true })
})

describe('extension', () => {
	test('service worker registers with extension URL', () => {
		expect(sw.url()).toMatch(/^chrome-extension:\/\/.+\/main\.js$/)
	})

	test('scans a valid QR code image and shows toast', async () => {
		const page = await context.newPage()

		try {
			await page.goto(`http://localhost:${server.port}/`)
			await page.waitForSelector('#qr')

			// Get tab ID via the SW which has <all_urls> host_permissions to query tabs
			const tabQueryUrl = `http://localhost:${server.port}/*`
			const tabId: number = await sw.evaluate(`
				(async () => {
					const tabs = await chrome.tabs.query({ url: ${JSON.stringify(tabQueryUrl)} });
					return tabs[0]?.id ?? -1;
				})()
			`)
			const qrImageUrl = `http://localhost:${server.port}/qr.jpg`

			// Trigger the extension's context menu handler directly from SW scope
			await sw.evaluate(`
				(async () => {
					const srcUrl = ${JSON.stringify(qrImageUrl)};
					const tid = ${JSON.stringify(tabId)};
					await chrome.contextMenus.onClicked.dispatch(
						{ menuItemId: 'scan-qr-code', srcUrl },
						{ id: tid, url: srcUrl, active: true, windowId: 1, index: 0 }
					);
				})()
			`)

			// The extension injects a toast div into the active tab
			const toast = await page.waitForSelector('#qr-scan-toast', { timeout: 5000 })
			const text = await toast.textContent()
			expect(text).toMatch(/QR (value copied|detected)/)
		} finally {
			await page.close()
		}
	})

	test('shows "no QR code" message for a plain image', async () => {
		const page = await context.newPage()

		try {
			// Serve a solid-colour PNG that contains no QR code
			await page.goto(`http://localhost:${server.port}/`)

			const tabQueryUrl = `http://localhost:${server.port}/*`
			const tabId: number = await sw.evaluate(`
				(async () => {
					const tabs = await chrome.tabs.query({ url: ${JSON.stringify(tabQueryUrl)} });
					return tabs[0]?.id ?? -1;
				})()
			`)

			const plainUrl = `http://localhost:${server.port}/1px_white.png`

			await sw.evaluate(`
				(async () => {
					const srcUrl = ${JSON.stringify(plainUrl)};
					const tid = ${JSON.stringify(tabId)};
					await chrome.contextMenus.onClicked.dispatch(
						{ menuItemId: 'scan-qr-code', srcUrl },
						{ id: tid, url: 'http://localhost/', active: true, windowId: 1, index: 0 }
					);
				})()
			`)

			const toast = await page.waitForSelector('#qr-scan-toast', { timeout: 5000 })
			const text = await toast.textContent()
			expect(text).toBe('No QR code detected in this image.')
		} finally {
			await page.close()
		}
	})
})
