import jsQR from 'jsqr'

// Cap maximum dimension so huge photos don't allocate huge ImageData buffers.
// QR codes stay scannable well below this.
const MAX_DIMENSION = 1024

async function fetch_blob(url: string): Promise<Blob> {
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Image download failed (${response.status})`)
	}
	return response.blob()
}

function scale_bitmap_to_image_data(bitmap: ImageBitmap): ImageData {
	// Scale down the bitmap to reduce memory usage.
	// QR codes are still scannable at smaller sizes.
	const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
	const width = Math.max(1, Math.round(bitmap.width * scale))
	const height = Math.max(1, Math.round(bitmap.height * scale))

	const canvas = new OffscreenCanvas(width, height)
	const context = canvas.getContext('2d')

	if (!context) {
		throw new Error('Canvas context unavailable')
	}

	context.drawImage(bitmap, 0, 0, width, height)
	return context.getImageData(0, 0, width, height)
}

function decode_qr(imageData: ImageData): string | null {
	const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
		inversionAttempts: 'attemptBoth',
	})
	return decoded?.data ?? null
}

export async function scan_qr_from_url(url: string): Promise<string | null> {
	const blob = await fetch_blob(url)
	const bitmap = await createImageBitmap(blob)

	try {
		const imageData = scale_bitmap_to_image_data(bitmap)
		return decode_qr(imageData)
	} finally {
		bitmap.close()
	}
}

export type QrRect = { x: number; y: number; width: number; height: number }

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
	const response = await fetch(dataUrl)
	return response.blob()
}

async function crop_blob_to_image_data(blob: Blob, rect: QrRect, dpr: number): Promise<ImageData> {
	const bitmap = await createImageBitmap(blob)
	try {
		const sx = Math.round(rect.x * dpr)
		const sy = Math.round(rect.y * dpr)
		const sw = Math.round(rect.width * dpr)
		const sh = Math.round(rect.height * dpr)

		const clampedW = Math.max(1, Math.min(sw, bitmap.width - sx))
		const clampedH = Math.max(1, Math.min(sh, bitmap.height - sy))
		const clampedX = Math.max(0, Math.min(sx, bitmap.width - 1))
		const clampedY = Math.max(0, Math.min(sy, bitmap.height - 1))

		// Fast path: if selection covers the whole capture, reuse existing scaling
		if (clampedW === bitmap.width && clampedH === bitmap.height) {
			return scale_bitmap_to_image_data(bitmap)
		}

		const canvas = new OffscreenCanvas(clampedW, clampedH)
		const context = canvas.getContext('2d')
		if (!context) {
			throw new Error('Canvas context unavailable')
		}
		context.drawImage(bitmap, clampedX, clampedY, clampedW, clampedH, 0, 0, clampedW, clampedH)

		// Reuse scaling logic: wrap cropped canvas into a bitmap then scale
		const croppedBlob = await canvas.convertToBlob()
		const croppedBitmap = await createImageBitmap(croppedBlob)
		try {
			return scale_bitmap_to_image_data(croppedBitmap)
		} finally {
			croppedBitmap.close()
		}
	} finally {
		bitmap.close()
	}
}

export async function scan_qr_from_data_url(
	dataUrl: string,
	rect?: QrRect,
	dpr?: number,
): Promise<string | null> {
	const blob = await dataUrlToBlob(dataUrl)

	if (!rect || !dpr) {
		const bitmap = await createImageBitmap(blob)
		try {
			return decode_qr(scale_bitmap_to_image_data(bitmap))
		} finally {
			bitmap.close()
		}
	}

	const imageData = await crop_blob_to_image_data(blob, rect, dpr)
	return decode_qr(imageData)
}
