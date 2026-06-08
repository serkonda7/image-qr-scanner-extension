export async function notifyInTab(
	tabId: number | undefined,
	message: string,
	success: boolean,
	imageUrl?: string,
): Promise<void> {
	if (!tabId) {
		console.log(message)
		return
	}

	try {
		await chrome.scripting.executeScript({
			target: { tabId },
			func: (text: string, ok: boolean, srcUrl?: string) => {
				// biome-ignore lint/suspicious/noExplicitAny: needed for dynamic window properties in scripting context
				const win = window as any
				if (typeof win.__qrScanCleanup === 'function') {
					win.__qrScanCleanup()
				}

				const toast = document.createElement('div')
				toast.id = 'qr-scan-toast'
				toast.textContent = text
				toast.style.position = 'fixed'
				toast.style.zIndex = '2147483647'
				toast.style.maxWidth = '360px'
				toast.style.padding = '10px 14px'
				toast.style.borderRadius = '8px'
				toast.style.fontFamily = 'system-ui, sans-serif'
				toast.style.fontSize = '13px'
				toast.style.lineHeight = '1.35'
				toast.style.color = '#fff'
				toast.style.background = ok ? '#0f7b0f' : '#a03a00'
				toast.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.35)'

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

				document.body.appendChild(toast)

				const cleanup = () => {
					toast.remove()
					window.removeEventListener('scroll', cleanup)
					if (win.__qrScanCleanup === cleanup) {
						win.__qrScanCleanup = undefined
					}
				}

				win.__qrScanCleanup = cleanup
				window.addEventListener('scroll', cleanup)
				setTimeout(cleanup, 3200)
			},
			args: [message, success, imageUrl],
		})
	} catch {
		console.log(message)
	}
}
