import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'

const ignoredDirs = new Set([
  '.demo-user-data',
  '.git',
  'build',
  'dist',
  'dist-electron',
  'logs',
  'node_modules',
  'release',
])

const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
])

const mojibakePatterns = [
  /\u00c3./,
  /\u00c2./,
  /\u00e2[^\s]/,
  /\u9225/,
  /\u922b/,
  /\u5bee\u20ac/,
  /\u95ab\u20ac/,
  /\u6769\u6d9c/,
  /\u701b\ufe3f/,
  /\u951b/,
]

const failures = []

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) walk(join(dir, entry.name))
      continue
    }

    const filePath = join(dir, entry.name)
    if (!textExtensions.has(extname(entry.name))) continue
    checkFile(filePath)
  }
}

function checkFile(filePath) {
  const bytes = readFileSync(filePath)

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    failures.push(`${filePath}: UTF-16LE BOM detected; use UTF-8`)
    return
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    failures.push(`${filePath}: UTF-16BE BOM detected; use UTF-8`)
    return
  }

  if (bytes.includes(0)) {
    failures.push(`${filePath}: NUL byte detected; this is not a normal UTF-8 text file`)
    return
  }

  const content = bytes.toString('utf8')
  if (content.includes('\uFFFD')) {
    failures.push(`${filePath}: replacement character detected; the file was likely decoded with the wrong encoding`)
  }

  for (const pattern of mojibakePatterns) {
    if (pattern.test(content)) {
      failures.push(`${filePath}: suspicious mojibake pattern ${pattern}`)
      break
    }
  }
}

walk('.')

if (failures.length > 0) {
  console.error('Encoding check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Encoding check passed.')
