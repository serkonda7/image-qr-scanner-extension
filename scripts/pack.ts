import fs from 'node:fs'
import path from 'node:path'
import { CompressionLevel, zipDirectory } from 'zip-bun'

const root = process.cwd()
const dist = path.join(root, 'dist')
const outFile = path.join(root, 'image-qr-scanner-extension.zip')

fs.statSync(dist)
fs.rmSync(outFile, { force: true })

await zipDirectory(dist, outFile, CompressionLevel.DEFAULT)

console.log(`Created ${path.relative(root, outFile)} from ${path.relative(root, dist)}.`)
