import { createServer } from 'node:http'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import mysql from 'mysql2/promise'

const __dirname = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT ?? 3010)
const host = process.env.HOST ?? '0.0.0.0'
const dataRoot = resolve(__dirname, process.env.EDITOR_API_DATA_DIR ?? './data/projects')
const allowOrigin = process.env.EDITOR_API_ALLOW_ORIGIN ?? '*'
const dbPassword = process.env.DB_PASSWORD?.trim()

const pool = dbPassword
  ? mysql.createPool({
      host: '62.234.36.130',
      port: 3306,
      user: 'root',
      password: dbPassword,
      database: 'campus_energy_db',
      charset: 'utf8mb4',
    })
  : null

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

function hashString(input) {
  let hash = 0

  for (const character of input) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }

  return hash
}

function pickFromList(input, values) {
  return values[hashString(input) % values.length]
}

function roundToSingle(value) {
  return Number(value.toFixed(1))
}

function buildMockSeries(seed) {
  const base = 2.8 + (seed % 8) * 0.45

  return ['00:00', '06:00', '12:00', '18:00'].map((time, index) => ({
    time,
    value: roundToSingle(base + ((seed >> (index * 3)) % 5) * 0.6 + index * 0.35),
  }))
}

function buildMockComponentEnergy(projectId, componentId) {
  const seed = hashString(componentId)
  const itemType = pickFromList(componentId, [
    'light',
    'fan',
    'fridge',
    'stove',
    'electricbox',
    'smarttoilet',
  ])
  const series = buildMockSeries(seed)
  const todayUsage = roundToSingle(series.reduce((sum, point) => sum + point.value, 0))
  const monthUsage = roundToSingle(todayUsage * (12 + (seed % 6)))
  const electricity = roundToSingle(3.5 + (seed % 11) * 1.4)

  return {
    binding: {
      bindingTargetId: componentId,
      bindingType: 'mock-meter',
    },
    componentId,
    currentPower: series.at(-1)?.value ?? electricity,
    electric_current_a: itemType === 'electricbox' ? roundToSingle(8 + (seed % 6) * 1.2) : null,
    electric_voltage_v: itemType === 'electricbox' ? roundToSingle(218 + (seed % 8)) : null,
    electricity_kwh: electricity,
    fridge_temp_setting: itemType === 'fridge' ? 4 : null,
    item_name: `Mock ${componentId}`,
    item_type: itemType,
    light_brightness_pct: itemType === 'light' ? 45 + (seed % 40) : null,
    monthUsage,
    motor_speed_level: itemType === 'fan' ? 1 + (seed % 4) : null,
    operating_status: pickFromList(componentId, ['正常', '高负载', '待机']),
    projectId,
    seat_temp_setting: itemType === 'smarttoilet' ? 36 : null,
    series,
    source: 'mock',
    stove_power_level: itemType === 'stove' ? 1 + (seed % 5) : null,
    todayUsage,
    updatedAt: new Date().toISOString(),
  }
}

function buildMockZoneEnergy(zoneId) {
  const seed = hashString(zoneId)

  return {
    indoor_humidity: roundToSingle(40 + (seed % 18)),
    indoor_temp: roundToSingle(21 + (seed % 7) * 0.6),
    occupancy_density: roundToSingle(0.4 + (seed % 9) * 0.18),
    total_electricity_kwh: roundToSingle(65 + (seed % 30) * 4.8),
    type: 'zone',
  }
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

async function loadComponentEnergyRecord(componentId) {
  if (!pool) {
    return null
  }

  const [rows] = await pool.execute(
    `SELECT item_type, item_name, electricity_kwh, operating_status, light_brightness_pct,
            fridge_temp_setting, motor_speed_level, stove_power_level,
            electric_voltage_v, electric_current_a, seat_temp_setting
       FROM appliances
      WHERE item_id = ?`,
    [componentId],
  )

  return rows[0] ?? null
}

async function loadZoneEnergyRecord(zoneId) {
  if (!pool) {
    return null
  }

  const [rows] = await pool.execute(
    `SELECT total_electricity_kwh, indoor_temp, indoor_humidity, occupancy_density
       FROM rooms
      WHERE room_id = ?`,
    [zoneId],
  )

  return rows[0] ?? null
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
        dataRoot,
        dbMode: pool ? 'mysql' : 'mock',
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

      try {
        const record = await loadComponentEnergyRecord(componentId)

        if (!record) {
          sendJson(response, 200, buildMockComponentEnergy(projectId, componentId))
          return
        }

        sendJson(response, 200, record)
      } catch (dbError) {
        console.error('[editor-api] component energy query failed, falling back to mock', dbError)
        sendJson(response, 200, buildMockComponentEnergy(projectId, componentId))
      }
      return
    }

    const zoneMatch = requestUrl.pathname.match(
      /^\/projects\/([a-zA-Z0-9_-]+)\/energy\/zones\/([a-zA-Z0-9_:-]+)$/,
    )

    if (request.method === 'GET' && zoneMatch?.[1] && zoneMatch?.[2]) {
      const zoneId = zoneMatch[2]

      try {
        const record = await loadZoneEnergyRecord(zoneId)

        if (!record) {
          sendJson(response, 200, buildMockZoneEnergy(zoneId))
          return
        }

        sendJson(response, 200, { type: 'zone', ...record })
      } catch (error) {
        console.error('[editor-api] zone energy query failed, falling back to mock', error)
        sendJson(response, 200, buildMockZoneEnergy(zoneId))
      }
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
  console.log(`[editor-api] energy data mode: ${pool ? 'mysql' : 'mock fallback'}`)
})
