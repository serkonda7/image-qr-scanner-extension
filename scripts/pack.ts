import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'

const OUT_FILE = 'image-qr-scanner.zip'
const root = process.cwd()
const dist = path.join(root, 'dist')
const outFile = path.join(root, OUT_FILE)

function collectFiles(dir: string): string[] {
	const entries = fs.readdirSync(dir, { withFileTypes: true })
	const files: string[] = []

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			files.push(...collectFiles(fullPath))
			continue
		}

		if (entry.isFile()) {
			files.push(fullPath)
		}
	}

	return files
}

// Check that dist exists
if (!fs.existsSync(dist)) {
	throw new Error(`Missing ${dist}. Run "bun run build".`)
}

// Clean up previous build artifacts
fs.rmSync(outFile, { force: true })

// Build the zip with dist contents at archive root.
const zip = new JSZip()
for (const filePath of collectFiles(dist)) {
	const archivePath = path.relative(dist, filePath).split(path.sep).join('/')
	zip.file(archivePath, fs.readFileSync(filePath), { date: new Date() })
}

const zipData = await zip.generateAsync({
	type: 'nodebuffer',
	compression: 'DEFLATE',
	compressionOptions: { level: 9 },
})

fs.writeFileSync(outFile, zipData)
console.log(`Packed dist/ into ${OUT_FILE}`)
