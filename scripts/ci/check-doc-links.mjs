import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const projectRoot = process.cwd()
const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.playwright',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
])

async function collectMarkdownFiles(directory = projectRoot) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return []

      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) return collectMarkdownFiles(absolutePath)
      if (!entry.isFile() || !/\.(?:md|markdown)$/i.test(entry.name)) return []
      return [absolutePath]
    }),
  )

  return files.flat()
}

function maskInlineCode(line) {
  return line.replace(/(`+)([\s\S]*?)\1/g, (match) => match.replace(/[^\n]/g, ' '))
}

function maskNonLinkContent(source) {
  const withoutComments = source.replace(/<!--[\s\S]*?-->/g, (match) =>
    match.replace(/[^\n]/g, ' '),
  )
  const lines = withoutComments.split('\n')
  let fence = null

  return lines
    .map((line) => {
      const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/)
      if (fenceMatch) {
        const marker = fenceMatch[1]
        if (!fence) fence = { character: marker[0], length: marker.length }
        else if (marker[0] === fence.character && marker.length >= fence.length) fence = null
        return ''
      }

      return fence ? '' : maskInlineCode(line)
    })
    .join('\n')
}

function extractInlineDestinations(line) {
  const destinations = []
  let searchFrom = 0

  while (searchFrom < line.length) {
    const opener = line.indexOf('](', searchFrom)
    if (opener === -1) break

    let cursor = opener + 2
    while (/\s/.test(line[cursor] || '')) cursor += 1

    if (line[cursor] === '<') {
      const end = line.indexOf('>', cursor + 1)
      if (end !== -1) destinations.push(line.slice(cursor + 1, end))
      searchFrom = end === -1 ? cursor + 1 : end + 1
      continue
    }

    const start = cursor
    let nestedParentheses = 0
    let escaped = false
    while (cursor < line.length) {
      const character = line[cursor]
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '(') {
        nestedParentheses += 1
      } else if (character === ')') {
        if (nestedParentheses === 0) break
        nestedParentheses -= 1
      } else if (/\s/.test(character) && nestedParentheses === 0) {
        break
      }
      cursor += 1
    }

    if (cursor > start) destinations.push(line.slice(start, cursor))
    searchFrom = Math.max(cursor + 1, opener + 2)
  }

  return destinations
}

function extractDestinations(source) {
  const maskedSource = maskNonLinkContent(source)
  const destinations = []

  for (const [index, line] of maskedSource.split('\n').entries()) {
    for (const destination of extractInlineDestinations(line)) {
      destinations.push({ destination, line: index + 1 })
    }

    const reference = line.match(/^\s{0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/)
    if (reference) {
      destinations.push({ destination: reference[1] || reference[2], line: index + 1 })
    }
  }

  return destinations
}

function decodeMarkdownEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([\da-f]+);/gi, (_, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)),
    )
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => {
      return { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }[entity]
    })
}

function githubHeadingSlug(rawHeading) {
  const plainText = decodeMarkdownEntities(rawHeading)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`+/g, '')
    .trim()
    .toLowerCase()

  return [...plainText]
    .filter(
      (character) =>
        character === '-' ||
        character === '_' ||
        /\s/u.test(character) ||
        /[\p{L}\p{M}\p{N}]/u.test(character),
    )
    .join('')
    .replace(/\s/g, '-')
}

function collectHeadingAnchors(source) {
  const withoutComments = source.replace(/<!--[\s\S]*?-->/g, '')
  const lines = withoutComments.split('\n')
  const anchors = new Set()
  const slugCounts = new Map()
  let fence = null

  const addHeading = (heading) => {
    const baseSlug = githubHeadingSlug(heading)
    if (!baseSlug) return

    const duplicateCount = slugCounts.get(baseSlug) || 0
    slugCounts.set(baseSlug, duplicateCount + 1)
    anchors.add(duplicateCount === 0 ? baseSlug : `${baseSlug}-${duplicateCount}`)
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1]
      if (!fence) fence = { character: marker[0], length: marker.length }
      else if (marker[0] === fence.character && marker.length >= fence.length) fence = null
      continue
    }
    if (fence) continue

    for (const explicitAnchor of line.matchAll(
      /<(?:a|span)\b[^>]*(?:id|name)=["']([^"']+)["'][^>]*>/gi,
    )) {
      anchors.add(explicitAnchor[1])
    }

    const atxHeading = line.match(/^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+\s*)?$/)
    if (atxHeading) {
      addHeading(atxHeading[1])
      continue
    }

    if (line.trim() && /^\s{0,3}(?:=+|-+)\s*$/.test(lines[index + 1] || '')) {
      addHeading(line.trim())
      index += 1
    }
  }

  return anchors
}

function resolveLocalTarget(markdownFile, rawDestination) {
  const destination = rawDestination.trim()
  if (!destination) return null
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(destination)) return null

  if (destination.startsWith('#')) {
    let fragment
    try {
      fragment = decodeURIComponent(destination.slice(1))
    } catch {
      fragment = destination.slice(1)
    }
    return { target: markdownFile, fragment, escapesProject: false }
  }

  const queryIndex = destination.indexOf('?')
  const fragmentIndex = destination.indexOf('#')
  const pathEnd = [queryIndex, fragmentIndex]
    .filter((index) => index >= 0)
    .reduce((lowest, index) => Math.min(lowest, index), destination.length)
  const pathOnly = destination.slice(0, pathEnd)
  if (!pathOnly) return null

  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathOnly).replace(/\\([\\()[\] ])/g, '$1')
  } catch {
    decodedPath = pathOnly
  }

  const target = decodedPath.startsWith('/')
    ? path.resolve(projectRoot, decodedPath.slice(1))
    : path.resolve(path.dirname(markdownFile), decodedPath)
  const relativeTarget = path.relative(projectRoot, target)
  const escapesProject =
    relativeTarget === '..' ||
    relativeTarget.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeTarget)

  let fragment = null
  if (fragmentIndex >= 0) {
    try {
      fragment = decodeURIComponent(destination.slice(fragmentIndex + 1))
    } catch {
      fragment = destination.slice(fragmentIndex + 1)
    }
  }

  return { target, fragment, escapesProject }
}

const markdownFiles = (await collectMarkdownFiles()).sort()
const linkProblems = []
const headingCache = new Map()

for (const markdownFile of markdownFiles) {
  const source = await readFile(markdownFile, 'utf8')
  const seen = new Set()

  for (const { destination, line } of extractDestinations(source)) {
    const resolved = resolveLocalTarget(markdownFile, destination)
    if (!resolved) continue
    const { target, fragment, escapesProject } = resolved

    const key = `${line}:${target}:${fragment || ''}`
    if (seen.has(key)) continue
    seen.add(key)

    if (escapesProject) {
      linkProblems.push({
        markdownFile,
        line,
        destination,
        target,
        reason: 'target escapes the repository root',
      })
      continue
    }

    try {
      await access(target)
    } catch {
      linkProblems.push({
        markdownFile,
        line,
        destination,
        target,
        reason: 'target does not exist',
      })
      continue
    }

    if (fragment && /\.(?:md|markdown)$/i.test(target)) {
      let anchors = headingCache.get(target)
      if (!anchors) {
        anchors = collectHeadingAnchors(await readFile(target, 'utf8'))
        headingCache.set(target, anchors)
      }

      if (!anchors.has(fragment)) {
        linkProblems.push({
          markdownFile,
          line,
          destination,
          target,
          reason: `heading #${fragment} does not exist`,
        })
      }
    }
  }
}

if (linkProblems.length > 0) {
  console.error(`Documentation link check found ${linkProblems.length} invalid local link(s):`)
  for (const link of linkProblems) {
    console.error(
      `  ${path.relative(projectRoot, link.markdownFile)}:${link.line} ` +
        `${link.destination} -> ${path.relative(projectRoot, link.target)} (${link.reason})`,
    )
  }
  process.exit(1)
}

console.log(`Documentation link check passed for ${markdownFiles.length} Markdown files.`)
