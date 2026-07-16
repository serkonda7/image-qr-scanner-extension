let contextSvg: SVGSVGElement | null = null

document.addEventListener(
	'contextmenu',
	(event) => {
		const target = event.target
		contextSvg = target instanceof Element ? target.closest('svg') : null
	},
	true,
)

async function rasterizeSvg(svg: SVGSVGElement): Promise<string> {
	const bounds = svg.getBoundingClientRect()
	const width = Math.max(1, Math.ceil(bounds.width || svg.viewBox.baseVal.width))
	const height = Math.max(1, Math.ceil(bounds.height || svg.viewBox.baseVal.height))
	const markup = new XMLSerializer().serializeToString(svg)
	const blob = new Blob([markup], { type: 'image/svg+xml' })
	const imageUrl = URL.createObjectURL(blob)

	try {
		const image = await new Promise<HTMLImageElement>((resolve, reject) => {
			const element = new Image()
			element.onload = () => resolve(element)
			element.onerror = () => reject(new Error('Could not render SVG image'))
			element.src = imageUrl
		})
		const canvas = document.createElement('canvas')
		canvas.width = width
		canvas.height = height
		const context = canvas.getContext('2d')
		if (!context) {
			throw new Error('Canvas context unavailable')
		}
		context.drawImage(image, 0, 0, width, height)
		return canvas.toDataURL('image/png')
	} finally {
		URL.revokeObjectURL(imageUrl)
	}
}

chrome.runtime.onMessage.addListener((message: unknown) => {
	if (message === 'has-context-svg') {
		return { hasSvg: contextSvg !== null }
	}

	if (message !== 'get-context-svg') {
		return undefined
	}

	if (!contextSvg) {
		return { error: 'No SVG image selected' }
	}

	return rasterizeSvg(contextSvg)
		.then((url) => ({ url }))
		.catch((error) => ({ error: error instanceof Error ? error.message : String(error) }))
})
