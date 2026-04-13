#!/usr/bin/env node

import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(__dirname, '..')
const sourceRoot = resolve(packageRoot, 'public')

function parseArgs(argv) {
  const result = {
    command: 'sync',
    target: './public',
    clean: false,
  }

  const args = [...argv]
  if (args[0] && !args[0].startsWith('-')) {
    result.command = args.shift()
  }

  while (args.length > 0) {
    const current = args.shift()
    if (current === '--target' || current === '-t') {
      result.target = args.shift() ?? result.target
      continue
    }
    if (current === '--clean') {
      result.clean = true
    }
  }

  return result
}

async function ensureDirectory(path) {
  await mkdir(path, { recursive: true })
}

async function listEntries(path) {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}

async function emptyDirectory(path) {
  const entries = await listEntries(path)
  await Promise.all(entries.map((entry) => rm(join(path, entry), { force: true, recursive: true })))
}

async function syncAssets(targetDirectory, clean) {
  const sourceStats = await stat(sourceRoot)
  if (!sourceStats.isDirectory()) {
    throw new Error(`Assets source not found: ${sourceRoot}`)
  }

  await ensureDirectory(targetDirectory)
  if (clean) {
    await emptyDirectory(targetDirectory)
  }

  await cp(sourceRoot, targetDirectory, {
    force: true,
    recursive: true,
  })

  console.log(`[pascal-editor-assets] synced assets to ${targetDirectory}`)
}

async function main() {
  const { command, target, clean } = parseArgs(process.argv.slice(2))
  const targetDirectory = resolve(process.cwd(), target)

  if (command !== 'sync') {
    throw new Error(`Unsupported command: ${command}`)
  }

  await syncAssets(targetDirectory, clean)
}

main().catch((error) => {
  console.error('[pascal-editor-assets] sync failed')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})