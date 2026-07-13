import jsQR from 'jsqr'

// Cap maximum dimension so huge photos don't allocate huge ImageData buffers.
// QR codes stay scannable well below this.
const MAX_DIMENSION = 1024

export async function scanQrFromImageUrl(url: string): Promise<string | null> {
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Image download failed (${response.status})`)
	}

	const blob = await response.blob()
	const bitmap = await createImageBitmap(blob)

	try {
		const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
		const width = Math.max(1, Math.round(bitmap.width * scale))
		const height = Math.max(1, Math.round(bitmap.height * scale))

		const canvas = new OffscreenCanvas(width, height)
		const context = canvas.getContext('2d')

		if (!context) {
			throw new Error('Canvas context unavailable')
		}

		context.drawImage(bitmap, 0, 0, width, height)

		const imageData = context.getImageData(0, 0, width, height)
		const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
			inversionAttempts: 'attemptBoth',
		})

		return decoded?.data ?? null
	} finally {
		bitmap.close()
	}
}
