import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const apiRoot = path.join(root, 'app', 'api')
const docsRoot = path.join(root, 'docs', 'api')

function walk(directory, predicate) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return walk(fullPath, predicate)
    return predicate(fullPath) ? [fullPath] : []
  })
}

const routeFiles = walk(apiRoot, (file) => /[/\\]route\.(?:ts|js)$/.test(file))
const expected = new Map()
const unsupportedRouteExports = []

const HTTP_METHOD_PATTERN = '(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)'

for (const file of routeFiles) {
  const source = fs.readFileSync(file, 'utf8')
  const relative = path.relative(path.join(root, 'app'), file).replaceAll(path.sep, '/')
  const route = `/${relative.replace(/\/route\.(?:ts|js)$/, '')}`
  const foundMethods = new Set()
  const patterns = [
    new RegExp(`^\\s*export\\s+(?:async\\s+)?function\\s+${HTTP_METHOD_PATTERN}\\b`, 'gm'),
    new RegExp(
      `^\\s*export\\s+(?:declare\\s+)?(?:const|let|var)\\s+${HTTP_METHOD_PATTERN}\\b`,
      'gm',
    ),
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) foundMethods.add(match[1])
  }

  // Next route handlers may also be exported through a named export list,
  // including aliases and re-exports: `export { handler as GET }`.
  const namedExportPattern = /^\s*export\s*\{([\s\S]*?)\}\s*(?:from\s*[^;\n]+)?;?/gm
  for (const match of source.matchAll(namedExportPattern)) {
    const entries = match[1]
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n\r]*/g, ' ')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)

    for (const entry of entries) {
      if (entry.startsWith('type ')) continue
      const exportMatch = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(entry)
      const exportedName = exportMatch?.[2] || exportMatch?.[1]
      if (exportedName && new RegExp(`^${HTTP_METHOD_PATTERN}$`).test(exportedName)) {
        foundMethods.add(exportedName)
      }
    }
  }

  // A star re-export or destructured exported declaration can conceal a
  // handler name from this dependency-free checker. Fail closed instead of
  // silently treating the route as documented.
  if (/^\s*export\s*\*/m.test(source)) {
    unsupportedRouteExports.push(
      `${path.relative(root, file)} uses a star export; export HTTP handlers by name`,
    )
  }
  if (/^\s*export\s+(?:declare\s+)?(?:const|let|var)\s*[\[{]/m.test(source)) {
    unsupportedRouteExports.push(
      `${path.relative(root, file)} uses a destructured export; export HTTP handlers by name`,
    )
  }

  // A default export can also conceal an object of handlers. Next route files
  // have no use for default exports, so make the documentation gate reject
  // them rather than guessing whether one contains runtime methods.
  if (/^\s*export\s+default\b/m.test(source)) {
    unsupportedRouteExports.push(
      `${path.relative(root, file)} uses a default export; export HTTP handlers by name`,
    )
  }

  for (const method of foundMethods) expected.set(`${method} ${route}`, file)
}

function maskMarkdownFencesAndComments(source) {
  const withoutComments = source.replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\r\n]/g, ' '),
  )
  let fence = null

  return (withoutComments.match(/.*(?:\r\n|\n|\r|$)/g) || [])
    .map((line) => {
      const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line)
      const wasInFence = fence !== null

      if (!fence && fenceMatch) {
        fence = { character: fenceMatch[1][0], length: fenceMatch[1].length }
      } else if (
        fence &&
        fenceMatch &&
        fenceMatch[1][0] === fence.character &&
        fenceMatch[1].length >= fence.length
      ) {
        fence = null
      }

      return wasInFence || fenceMatch ? line.replace(/[^\r\n]/g, ' ') : line
    })
    .join('')
}

const docFiles = walk(
  docsRoot,
  (file) => file.endsWith('.md') && path.basename(file) !== 'README.md',
)
const documented = new Map()
const malformed = []

for (const file of docFiles) {
  const source = fs.readFileSync(file, 'utf8')
  const checkableSource = maskMarkdownFencesAndComments(source)
  const headingPattern = /^###\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+`(\/api\/[^`]+)`\s*$/gm
  const headings = [...checkableSource.matchAll(headingPattern)]

  for (let index = 0; index < headings.length; index += 1) {
    const match = headings[index]
    const key = `${match[1]} ${match[2]}`
    const start = match.index + match[0].length
    const nextSection = /^#{1,3}\s+/gm
    nextSection.lastIndex = start
    const sectionMatch = nextSection.exec(checkableSource)
    const end = sectionMatch?.index ?? checkableSource.length
    const block = checkableSource.slice(start, end)
    const invalidLabels = ['Access', 'Input', 'Success', 'Errors'].flatMap((label) => {
      const count = [...block.matchAll(new RegExp(`^\\*\\*${label}:\\*\\*`, 'gm'))].length
      if (count === 1) return []
      return [`${label} (${count === 0 ? 'missing' : `repeated ${count} times`})`]
    })

    if (invalidLabels.length > 0) {
      malformed.push(`${key} in ${path.relative(root, file)}: ${invalidLabels.join(', ')}`)
    }

    const locations = documented.get(key) || []
    locations.push(path.relative(root, file))
    documented.set(key, locations)
  }
}

const missing = [...expected.keys()].filter((key) => !documented.has(key)).sort()
const unknown = [...documented.keys()].filter((key) => !expected.has(key)).sort()
const duplicates = [...documented.entries()]
  .filter(([, locations]) => locations.length > 1)
  .map(([key, locations]) => `${key}: ${locations.join(', ')}`)
  .sort()

if (
  unsupportedRouteExports.length ||
  missing.length ||
  unknown.length ||
  duplicates.length ||
  malformed.length
) {
  if (unsupportedRouteExports.length) {
    console.error(`Unsupported route exports:\n${unsupportedRouteExports.join('\n')}`)
  }
  if (missing.length) console.error(`Missing API documentation:\n${missing.join('\n')}`)
  if (unknown.length) console.error(`Unknown documented handlers:\n${unknown.join('\n')}`)
  if (duplicates.length) console.error(`Duplicate API documentation:\n${duplicates.join('\n')}`)
  if (malformed.length) console.error(`Incomplete API documentation:\n${malformed.join('\n')}`)
  process.exit(1)
}

console.log(
  `Detailed API documentation covers ${expected.size} handlers across ${routeFiles.length} route files.`,
)
