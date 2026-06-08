export async function notifyInTab(
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
