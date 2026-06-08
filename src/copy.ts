export type ClipboardResult = { ok: true } | { ok: false; reason: string }

export async function copyToClipboardInTab(
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
