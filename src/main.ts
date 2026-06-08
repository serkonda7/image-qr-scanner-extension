import { copyToClipboardInTab } from './copy'
import { notifyInTab } from './notify'
import { scanQrFromImageUrl } from './qr'

declare const __E2E_TEST__: boolean

const MENU_ID = 'scan-qr-code'

function createContextMenu(): void {
	chrome.contextMenus.removeAll(() => {
		chrome.contextMenus.create({
			id: MENU_ID,
			title: 'Scan QR code',
			contexts: ['image'],
		})
	})
}

chrome.runtime.onInstalled.addListener(() => {
	createContextMenu()
})

chrome.runtime.onStartup.addListener(() => {
	createContextMenu()
})

async function handleScanRequest(
	info: chrome.contextMenus.OnClickData,
	tab?: chrome.tabs.Tab,
): Promise<void> {
	if (info.menuItemId !== MENU_ID || !info.srcUrl) {
		return
	}

	try {
		const qrValue = await scanQrFromImageUrl(info.srcUrl)

		if (!qrValue) {
			await notifyInTab(tab?.id, 'No QR code detected in this image.', false)
			return
		}

		const copyResult = await copyToClipboardInTab(tab?.id, qrValue)

		if (copyResult?.ok) {
			await notifyInTab(tab?.id, 'QR value copied to clipboard.', true)
		} else {
			await notifyInTab(tab?.id, `QR detected: ${qrValue}`, false)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		await notifyInTab(tab?.id, `QR scan failed: ${message}`, false)
	}
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	await handleScanRequest(info, tab)
})

// E2E test hook: Playwright can invoke this from the extension service worker context.
// The native context menu is not supported in headless mode.
if (__E2E_TEST__) {
	;(globalThis as { __e2eScanQr?: typeof handleScanRequest }).__e2eScanQr = handleScanRequest
}
