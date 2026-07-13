import fs from 'node:fs'
import path from 'node:path'
import { zipDirectory } from 'zip-bun'

const OUT_FILE = 'image-qr-scanner.zip'
const root = process.cwd()
const dist = path.join(root, 'dist')
const outFile = path.join(root, OUT_FILE)

// Clean up previous build artifacts
fs.rmSync(outFile, { force: true })

// Zip the dist directory
await zipDirectory(dist, outFile)
console.log(`Packed dist/ into ${OUT_FILE}`)
