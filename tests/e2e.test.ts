import { afterAll, beforeAll, expect, test } from 'bun:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { type BrowserContext, chromium, type Worker } from 'playwright'

let context: BrowserContext
let sw: Worker
let profileDir: string
let server: ReturnType<typeof Bun.serve>

const EXT_PATH = path.resolve(import.meta.dir, '..', 'dist')
const qr_file = path.join(import.meta.dir, 'qr_webstore.jpg')
const no_qr_file = path.join(import.meta.dir, 'no_qr.png')

const test_server_options = {
	port: 0,
	routes: {
		'/qr.jpg': new Response(await Bun.file(qr_file).bytes()),
		'/no_qr.png': new Response(await Bun.file(no_qr_file).bytes()),
		'/': async () => {
			return new Response(
				`<!doctype html><html><body>
				<img id="qr" src="http://localhost:${server.port}/qr.jpg" />
				</body></html>`,
				{ headers: { 'content-type': 'text/html' } },
			)
		},
	},
	fetch(_req: Request) {
		return new Response('not found', { status: 404 })
	},
} as Bun.Serve.Options<never, never>

async function waitForServiceWorker(ctx: BrowserContext): Promise<Worker> {
	const existing = ctx.serviceWorkers()
	if (existing.length > 0) {
		return existing[0]
	}
	return ctx.waitForEvent('serviceworker', { timeout: 15000 })
}

async function getServerTabId(worker: Worker): Promise<number> {
	const tabQueryUrl = `http://localhost:${server.port}/*`
	return worker.evaluate(`
		(async () => {
			const tabs = await chrome.tabs.query({ url: ${JSON.stringify(tabQueryUrl)} });
			return tabs[0]?.id ?? -1;
		})()
	`)
}

async function triggerScanFromContextMenu(
	worker: Worker,
	tabId: number,
	srcUrl: string,
	tabUrl: string = srcUrl,
) {
	await worker.evaluate(`
		(async () => {
			const run = globalThis.__e2eScanQr;
			if (typeof run !== 'function') {
				throw new Error('__e2eScanQr test hook is unavailable');
			}
			await run(
				{ menuItemId: 'scan-qr-code', srcUrl: ${JSON.stringify(srcUrl)} },
				{ id: ${JSON.stringify(tabId)}, url: ${JSON.stringify(tabUrl)}, active: true, windowId: 1, index: 0 }
			);
		})()
	`)
}

beforeAll(async () => {
	// Serve the QR image over HTTP so the service worker can fetch it
	server = Bun.serve(test_server_options)

	// Extensions require a real user-data-dir and cannot run in headless shell
	profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qr-e2e-profile-'))

	// Launch Chrome with the built extension loaded
	context = await chromium.launchPersistentContext(profileDir, {
		channel: 'chromium',
		args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
	})

	sw = await waitForServiceWorker(context)
})

afterAll(async () => {
	await context?.close()
	server?.stop(true)
	await fs.rm(profileDir, { recursive: true, force: true })
})

test('scans a valid QR code image and shows toast', async () => {
	const page = await context.newPage()

	try {
		await page.goto(`http://localhost:${server.port}/`)
		await page.waitForSelector('#qr')
		const qrImageUrl = `http://localhost:${server.port}/qr.jpg`
		const tabId = await getServerTabId(sw)
		await triggerScanFromContextMenu(sw, tabId, qrImageUrl)

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
		const tabId = await getServerTabId(sw)
		const plainUrl = `http://localhost:${server.port}/no_qr.png`
		await triggerScanFromContextMenu(sw, tabId, plainUrl, 'http://localhost/')

		const toast = await page.waitForSelector('#qr-scan-toast', { timeout: 5000 })
		const text = await toast.textContent()
		expect(text).toBe('No QR code detected in this image.')
	} finally {
		await page.close()
	}
})
