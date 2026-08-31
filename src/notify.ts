type QrScanWindow = Window & { __qrScanCleanup?: () => void }

function show_notification(text: string, ok: boolean, srcUrl?: string) {
	const win = window as QrScanWindow
	if (typeof win.__qrScanCleanup === 'function') {
		win.__qrScanCleanup()
	}

	const toast = document.createElement('div')
	toast.id = 'qr-scan-toast'
	toast.textContent = text
	toast.style.cssText = `
		position: fixed;
		z-index: 2147483647;
		max-width: 360px;
		padding: 10px 14px;
		border-radius: 8px;
		font-family: system-ui, sans-serif;
		font-size: 13px;
		line-height: 1.35;
		color: #fff;
		background: ${ok ? '#0f7b0f' : '#a03a00'};
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
		word-break: break-all;
		white-space: pre-wrap;
	`

	let positioned = false
	if (srcUrl) {
		const img = Array.from(document.querySelectorAll('img')).find((el) => el.src === srcUrl)
		if (img) {
			const rect = img.getBoundingClientRect()
			const top = Math.max(16, Math.min(window.innerHeight - 80, rect.top + 8))
			const left = Math.max(16, Math.min(window.innerWidth - 380, rect.left + 8))

			toast.style.left = `${left}px`
			toast.style.top = `${top}px`
			positioned = true
		}
	}

	if (!positioned) {
		toast.style.right = '16px'
		toast.style.bottom = '16px'
	}

	const container = document.body ?? document.documentElement
	container.appendChild(toast)

	const cleanup = () => {
		toast.remove()
		window.removeEventListener('scroll', cleanup)
		if (win.__qrScanCleanup === cleanup) {
			win.__qrScanCleanup = undefined
		}
	}

	win.__qrScanCleanup = cleanup
	window.addEventListener('scroll', cleanup)
	// Keep successful copy visible longer so the user can see the value
	setTimeout(cleanup, ok ? 6000 : 3200)
}

export class Notifier {
	constructor(
		private tabId?: number,
		private imageUrl?: string,
	) {}

	private async fallbackSystemNotification(message: string, success: boolean): Promise<void> {
		try {
			// Requires "notifications" permission; best-effort fallback when in-page toast cannot be injected
			// (e.g. PDF viewer without a writable DOM, chrome:// pages)
			await chrome.notifications.create({
				type: 'basic',
				iconUrl: 'img/icon.png',
				title: success ? 'QR code scanned' : 'QR scanner',
				message,
				priority: success ? 2 : 1,
			})
		} catch {
			console.log(message)
		}
	}

	async notify(message: string, success: boolean): Promise<void> {
		if (!this.tabId) {
			await this.fallbackSystemNotification(message, success)
			return
		}

		try {
			await chrome.scripting.executeScript({
				target: { tabId: this.tabId },
				func: show_notification,
				args: [message, success, this.imageUrl],
			})
			// Also fire a system notification on success so it is visible even if the toast is
			// obscured (PDF viewer) or the tab is in background
			if (success) {
				await this.fallbackSystemNotification(message, success)
			}
		} catch {
			await this.fallbackSystemNotification(message, success)
		}
	}
}
