import { createServer } from 'node:http'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT ?? 3010)
const host = process.env.HOST ?? '0.0.0.0'
const dataRoot = resolve(__dirname, process.env.EDITOR_API_DATA_DIR ?? './data/projects')
const allowOrigin = process.env.EDITOR_API_ALLOW_ORIGIN ?? '*'

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

function isValidProjectId(projectId) {
  return /^[a-zA-Z0-9_-]+$/.test(projectId)
}

function isValidComponentId(componentId) {
  return /^[a-zA-Z0-9_:-]+$/.test(componentId)
}

function getProjectFilePath(projectId) {
  return join(dataRoot, `${projectId}.json`)
}

async function listProjectSummaries() {
  await mkdir(dataRoot, { recursive: true })
  const entries = await readdir(dataRoot, { withFileTypes: true })

  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map(async (entry) => {
        const filePath = join(dataRoot, entry.name)
        const fileStat = await stat(filePath)
        return {
          projectId: entry.name.replace(/\.json$/, ''),
          updatedAt: fileStat.mtime.toISOString(),
        }
      }),
  )

  return projects.sort((left, right) => left.projectId.localeCompare(right.projectId))
}

async function readRequestBody(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
}

function isSceneGraph(scene) {
  if (!scene || typeof scene !== 'object') return false
  if (!scene.nodes || typeof scene.nodes !== 'object') return false
  if (!Array.isArray(scene.rootNodeIds)) return false
  return true
}

function seededNumber(input, offset) {
  let value = 0

  for (let index = 0; index < input.length; index += 1) {
    value += input.charCodeAt(index) * (index + 1 + offset)
  }

  return value
}

function buildEnergyPayload(projectId, componentId) {
  const seed = seededNumber(`${projectId}:${componentId}`, 7)
  const series = Array.from({ length: 8 }, (_, index) => {
    const base = ((seed % 80) + index * 11) % 42
    return {
      time: `${String(index * 3).padStart(2, '0')}:00`,
      value: Number((base / 3.5 + 1.2).toFixed(2)),
    }
  })

  return {
    projectId,
    componentId,
    binding: {
      bindingType: 'mock-meter',
      bindingTargetId: `meter-${componentId}`,
    },
    currentPower: Number((((seed % 90) / 10) + 1.4).toFixed(1)),
    todayUsage: Number((((seed % 320) / 4) + 9).toFixed(1)),
    monthUsage: Number((((seed % 2800) / 2.2) + 180).toFixed(1)),
    series,
    updatedAt: new Date().toISOString(),
  }
}

async function loadProjectScene(projectId) {
  const filePath = getProjectFilePath(projectId)
  const [fileText, fileInfo] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)])
  const payload = JSON.parse(fileText)

  if (isSceneGraph(payload)) {
    return {
      projectId,
      scene: payload,
      updatedAt: fileInfo.mtime.toISOString(),
    }
  }

  if (payload && typeof payload === 'object' && isSceneGraph(payload.scene)) {
    return {
      projectId: typeof payload.projectId === 'string' ? payload.projectId : projectId,
      scene: payload.scene,
      updatedAt:
        typeof payload.updatedAt === 'string' ? payload.updatedAt : fileInfo.mtime.toISOString(),
    }
  }

  throw new Error('Invalid project scene file')
}

async function saveProjectScene(projectId, scene) {
  const filePath = getProjectFilePath(projectId)
  await mkdir(dirname(filePath), { recursive: true })

  const updatedAt = new Date().toISOString()

  await writeFile(filePath, `${JSON.stringify(scene, null, 2)}\n`, 'utf8')

  return {
    projectId,
    scene,
    updatedAt,
  }
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      response.end()
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      sendJson(response, 200, {
        status: 'ok',
        app: 'editor-api',
        timestamp: new Date().toISOString(),
      })
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/projects') {
      const projects = await listProjectSummaries()
      sendJson(response, 200, { projects })
      return
    }

    const energyMatch = requestUrl.pathname.match(
      /^\/projects\/([a-zA-Z0-9_-]+)\/energy\/components\/([a-zA-Z0-9_:-]+)$/,
    )

    if (request.method === 'GET' && energyMatch?.[1] && energyMatch?.[2]) {
      const projectId = energyMatch[1]
      const componentId = energyMatch[2]

      if (!isValidProjectId(projectId)) {
        sendJson(response, 400, { error: 'Invalid projectId' })
        return
      }

      if (!isValidComponentId(componentId)) {
        sendJson(response, 400, { error: 'Invalid componentId' })
        return
      }

      sendJson(response, 200, buildEnergyPayload(projectId, componentId))
      return
    }

    const projectMatch = requestUrl.pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/scene$/)
    if (!projectMatch?.[1]) {
      sendJson(response, 404, { error: 'Not found' })
      return
    }

    const projectId = projectMatch[1]
    if (!isValidProjectId(projectId)) {
      sendJson(response, 400, { error: 'Invalid projectId' })
      return
    }

    if (request.method === 'GET') {
      try {
        const payload = await loadProjectScene(projectId)
        sendJson(response, 200, payload)
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          sendJson(response, 404, { error: 'Project scene not found', projectId })
          return
        }

        throw error
      }
      return
    }

    if (request.method === 'PUT') {
      const rawBody = await readRequestBody(request)
      const body = rawBody ? JSON.parse(rawBody) : null
      const scene = body?.scene

      if (!isSceneGraph(scene)) {
        sendJson(response, 400, { error: 'Invalid scene payload' })
        return
      }

      const payload = await saveProjectScene(projectId, scene)
      sendJson(response, 200, payload)
      return
    }

    sendJson(response, 405, { error: 'Method not allowed' })
  } catch (error) {
    console.error('[editor-api] request failed', error)
    sendJson(response, 500, { error: 'Internal server error' })
  }
})

server.listen(port, host, () => {
  console.log(`[editor-api] listening on http://${host}:${port}`)
  console.log(`[editor-api] storing scene files in ${dataRoot}`)
})