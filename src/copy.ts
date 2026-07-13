// Custom Result type as it runs in injected script context
export type ClipboardResult = { ok: true } | { ok: false; reason: string }

// Copy using the async Clipboard API first or execCommand fallback.
async function write_to_clipboard(value: string): Promise<ClipboardResult> {
	try {
		await navigator.clipboard.writeText(value)
		return { ok: true }
	} catch {
		// Fallback: deprecated `execCommand` and a hidden textarea
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
}

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
			func: write_to_clipboard,
			args: [text],
		})

		return (result?.result as ClipboardResult) ?? { ok: false, reason: 'No script result' }
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error)
		return { ok: false, reason }
	}
}
