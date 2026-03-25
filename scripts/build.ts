import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dist = path.join(root, 'dist')

async function main() {
	fs.rmSync(dist, { recursive: true, force: true })
	fs.mkdirSync(dist, { recursive: true })

	const result = await Bun.build({
		entrypoints: [path.join(root, 'src', 'main.ts')],
		outdir: dist,
		target: 'browser',
		format: 'esm',
		minify: true,
	})

	if (!result.success) {
		for (const message of result.logs) {
			console.error(message)
		}
		process.exit(1)
	}

	const staticFiles = ['manifest.json', 'LICENSE.txt', 'README.md']
	for (const file of staticFiles) {
		fs.cpSync(path.join(root, file), path.join(dist, file))
	}
}

await main()
