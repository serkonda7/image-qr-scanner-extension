import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dist = path.join(root, 'dist')

const STATIC_FILES = ['manifest.json', 'LICENSE.txt', 'README.md'] as const
const ENTRYPOINTS = [path.join(root, 'src', 'main.ts'), path.join(root, 'src', 'svg.ts')]

fs.rmSync(dist, { recursive: true, force: true })
fs.mkdirSync(dist, { recursive: true })

// Build with Bun
const result = await Bun.build({
	entrypoints: ENTRYPOINTS,
	outdir: dist,
	target: 'browser',
	format: 'esm',
	minify: true,
	define: {
		__E2E_TEST__: JSON.stringify(process.env.E2E_TEST === '1'),
	},
})

// Show error if build failed
if (!result.success) {
	for (const message of result.logs) {
		console.error(message)
	}
	process.exit(1)
}

// Copy static files to dist
for (const file of STATIC_FILES) {
	fs.cpSync(path.join(root, file), path.join(dist, file))
}
