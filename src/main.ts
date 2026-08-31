import { copyToClipboardInTab } from './copy'
import { Notifier } from './notify'
import { type QrRect, scan_qr_from_data_url, scan_qr_from_url } from './qr'

declare const __E2E_TEST__: boolean

const MENU_ID = 'scan-qr-code'

function createContextMenu(): void {
	chrome.contextMenus.removeAll(() => {
		chrome.contextMenus.create({
			id: MENU_ID,
			title: 'Scan QR code',
			contexts: ['image', 'page'],
		})
	})
}

chrome.runtime.onInstalled.addListener(createContextMenu)

async function getContextSvgUrl(tabId: number | undefined): Promise<string | null> {
	if (!tabId) {
		return null
	}

	try {
		const response = await chrome.tabs.sendMessage(tabId, 'get-context-svg')
		return typeof response?.url === 'string' ? response.url : null
	} catch {
		return null
	}
}

async function handleScanRequest(
	info: chrome.contextMenus.OnClickData,
	tab?: chrome.tabs.Tab,
): Promise<void> {
	// Return if another menu item was clicked
	if (info.menuItemId !== MENU_ID) {
		return
	}

	const imageUrl = info.srcUrl ?? (await getContextSvgUrl(tab?.id))
	if (!imageUrl) {
		return
	}

	const notifier = new Notifier(tab?.id, imageUrl)

	try {
		const qrValue = await scan_qr_from_url(imageUrl)

		if (!qrValue) {
			await notifier.notify('No QR code detected in this image.', false)
			return
		}

		const copyResult = await copyToClipboardInTab(tab?.id, qrValue)

		if (copyResult?.ok) {
			await notifier.notify('QR value copied to clipboard.', true)
		} else {
			await notifier.notify(`QR detected: ${qrValue}`, false)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		await notifier.notify(`QR scan failed: ${message}`, false)
	}
}

// Register context menu click listener
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	await handleScanRequest(info, tab)
})

async function handleRegionScan(tabId: number, rect: QrRect, dpr: number): Promise<void> {
	const notifier = new Notifier(tabId)
	try {
		const tab = await chrome.tabs.get(tabId)
		const dataUrl: string = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
		const qrValue = await scan_qr_from_data_url(dataUrl, rect, dpr)

		if (!qrValue) {
			await notifier.notify('No QR code detected in selected region.', false)
			return
		}

		const copyResult = await copyToClipboardInTab(tabId, qrValue)

		if (copyResult?.ok) {
			await notifier.notify('QR value copied to clipboard.', true)
		} else {
			await notifier.notify(`QR detected: ${qrValue}`, false)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		await notifier.notify(`QR scan failed: ${message}`, false)
	}
}

chrome.runtime.onMessage.addListener(
	(
		message: unknown,
		sender: chrome.runtime.MessageSender,
		_sendResponse: (response?: unknown) => void,
	): boolean | undefined => {
		if (
			typeof message === 'object' &&
			message !== null &&
			(message as { type?: string }).type === 'qr-region-selected'
		) {
			const { rect, dpr } = message as { rect: QrRect; dpr: number }
			const tabId = sender.tab?.id
			if (tabId !== undefined && rect && typeof dpr === 'number') {
				void handleRegionScan(tabId, rect, dpr)
			}
			return undefined
		}
		return undefined
	},
)

chrome.action.onClicked.addListener(async (tab) => {
	if (!tab?.id) {
		return
	}

	// Some URLs (chrome://, edge://, chrome-extension://, Web Store) block scripting
	if (
		tab.url?.startsWith('chrome://') ||
		tab.url?.startsWith('chrome-extension://') ||
		tab.url?.startsWith('edge://') ||
		tab.url?.startsWith('about:')
	) {
		const notifier = new Notifier(tab.id)
		await notifier.notify('Cannot scan QR on this page.', false)
		return
	}

	try {
		await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			files: ['overlay.js'],
		})
	} catch (error) {
		const notifier = new Notifier(tab.id)
		const message = error instanceof Error ? error.message : String(error)
		const isFileUrl = tab.url?.startsWith('file://')
		const hint = isFileUrl
			? ' Enable "Allow access to file URLs" for this extension in chrome://extensions.'
			: ''
		await notifier.notify(`Could not start region selector: ${message}.${hint}`, false)
	}
})

// E2E test hook: Playwright can invoke this from the extension service worker context.
// The native context menu is not supported in headless mode.
if (__E2E_TEST__) {
	;(globalThis as { __e2eScanQr?: typeof handleScanRequest }).__e2eScanQr = handleScanRequest
	;(globalThis as { __e2eScanRegion?: typeof handleRegionScan }).__e2eScanRegion =
		handleRegionScan
}
