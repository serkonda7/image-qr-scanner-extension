import jsQR from 'jsqr'

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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
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
})

async function scanQrFromImageUrl(url: string): Promise<string | null> {
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Image download failed (${response.status})`)
	}

	const blob = await response.blob()
	const bitmap = await createImageBitmap(blob)

	try {
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
		const context = canvas.getContext('2d')

		if (!context) {
			throw new Error('Canvas context unavailable')
		}

		context.drawImage(bitmap, 0, 0)

		const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height)
		const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
			inversionAttempts: 'attemptBoth',
		})

		return decoded?.data ?? null
	} finally {
		bitmap.close()
	}
}

type ClipboardResult = { ok: true } | { ok: false; reason: string }

async function copyToClipboardInTab(
	tabId: number | undefined,
	text: string,
): Promise<ClipboardResult> {
	if (!tabId) {
		return { ok: false, reason: 'No active tab available' }
	}

	try {
		const [result] = await chrome.scripting.executeScript({
			target: { tabId },
			func: async (value: string): Promise<ClipboardResult> => {
				try {
					await navigator.clipboard.writeText(value)
					return { ok: true }
				} catch {
					const textArea = document.createElement('textarea')
					textArea.value = value
					textArea.setAttribute('readonly', '')
					textArea.style.position = 'fixed'
					textArea.style.top = '-9999px'
					document.body.appendChild(textArea)
					textArea.select()
					const success = document.execCommand('copy')
					document.body.removeChild(textArea)
					return success ? { ok: true } : { ok: false, reason: 'Clipboard access denied' }
				}
			},
			args: [text],
		})

		return (result?.result as ClipboardResult) ?? { ok: false, reason: 'No script result' }
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error)
		return { ok: false, reason }
	}
}

async function notifyInTab(
	tabId: number | undefined,
	message: string,
	success: boolean,
): Promise<void> {
	if (!tabId) {
		console.log(message)
		return
	}

	try {
		await chrome.scripting.executeScript({
			target: { tabId },
			func: (text: string, ok: boolean) => {
				const existing = document.getElementById('qr-scan-toast')
				if (existing) {
					existing.remove()
				}

				const toast = document.createElement('div')
				toast.id = 'qr-scan-toast'
				toast.textContent = text
				toast.style.position = 'fixed'
				toast.style.zIndex = '2147483647'
				toast.style.right = '16px'
				toast.style.bottom = '16px'
				toast.style.maxWidth = '360px'
				toast.style.padding = '10px 14px'
				toast.style.borderRadius = '8px'
				toast.style.fontFamily = 'system-ui, sans-serif'
				toast.style.fontSize = '13px'
				toast.style.lineHeight = '1.35'
				toast.style.color = '#fff'
				toast.style.background = ok ? '#0f7b0f' : '#a03a00'
				toast.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.35)'

				document.body.appendChild(toast)
				setTimeout(() => {
					toast.remove()
				}, 3200)
			},
			args: [message, success],
		})
	} catch {
		console.log(message)
	}
}
