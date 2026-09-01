// Injected on demand when the user clicks the extension action.
// Creates a full-viewport overlay that lets the user drag to select a
// rectangular region. The selected rect (in CSS pixels) is sent to the
// service worker for capture + QR scan. Works on normal pages and on
// locally opened PDFs rendered by Chrome's PDF viewer.

export {}

declare global {
	interface Window {
		__qrOverlayActive?: boolean
		__qrOverlayCleanup?: () => void
	}
}

function startOverlay(): void {
	if (window.__qrOverlayActive) {
		return
	}
	window.__qrOverlayActive = true

	const overlay = document.createElement('div')
	overlay.id = 'qr-scan-overlay'
	overlay.style.cssText = `
		position: fixed;
		inset: 0;
		z-index: 2147483646;
		cursor: crosshair;
		background: rgba(0, 0, 0, 0.15);
		user-select: none;
	`

	const hint = document.createElement('div')
	hint.textContent = 'Drag to select area to scan  •  Esc to cancel'
	hint.style.cssText = `
		position: fixed;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 2147483647;
		padding: 8px 14px;
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.78);
		color: #fff;
		font-family: system-ui, sans-serif;
		font-size: 13px;
		line-height: 1;
		pointer-events: none;
	`
	overlay.appendChild(hint)

	const selection = document.createElement('div')
	selection.style.cssText = `
		position: fixed;
		border: 2px dashed #00a8ff;
		background: rgba(0, 168, 255, 0.15);
		display: none;
		pointer-events: none;
	`
	overlay.appendChild(selection)

	let startX = 0
	let startY = 0
	let dragging = false
	let finished = false

	function cleanup(): void {
		finished = true
		window.__qrOverlayActive = false
		window.__qrOverlayCleanup = undefined
		document.removeEventListener('keydown', onKeyDown)
		overlay.remove()
	}

	window.__qrOverlayCleanup = cleanup

	function onKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault()
			cleanup()
		}
	}
	document.addEventListener('keydown', onKeyDown)

	function updateSelection(currentX: number, currentY: number): void {
		const left = Math.min(startX, currentX)
		const top = Math.min(startY, currentY)
		const width = Math.abs(currentX - startX)
		const height = Math.abs(currentY - startY)
		selection.style.left = `${left}px`
		selection.style.top = `${top}px`
		selection.style.width = `${width}px`
		selection.style.height = `${height}px`
	}

	overlay.addEventListener('mousedown', (event) => {
		if (finished) {
			return
		}
		event.preventDefault()
		dragging = true
		startX = event.clientX
		startY = event.clientY
		selection.style.display = 'block'
		updateSelection(startX, startY)
	})

	overlay.addEventListener('mousemove', (event) => {
		if (!dragging) {
			return
		}
		updateSelection(event.clientX, event.clientY)
	})

	overlay.addEventListener('mouseup', (event) => {
		if (!dragging || finished) {
			return
		}
		dragging = false

		const endX = event.clientX
		const endY = event.clientY
		const left = Math.min(startX, endX)
		const top = Math.min(startY, endY)
		const width = Math.abs(endX - startX)
		const height = Math.abs(endY - startY)

		cleanup()

		// Ignore tiny accidental clicks
		if (width < 10 || height < 10) {
			return
		}

		chrome.runtime.sendMessage({
			type: 'qr-region-selected',
			rect: { x: left, y: top, width, height },
			dpr: window.devicePixelRatio || 1,
		})
	})

	// Click without drag should not trigger anything; mousedown/mouseup handles it
	overlay.addEventListener('click', (event) => {
		event.preventDefault()
	})

	document.documentElement.appendChild(overlay)
}

startOverlay()
