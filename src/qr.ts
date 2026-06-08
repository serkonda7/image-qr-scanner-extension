import jsQR from 'jsqr'

export async function scanQrFromImageUrl(url: string): Promise<string | null> {
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
