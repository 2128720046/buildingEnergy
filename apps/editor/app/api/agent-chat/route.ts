import { NextRequest, NextResponse } from 'next/server'

interface EnergySeriesPoint {
  time: string
  value: number
}

interface EnergyAssistantContextPayload {
  energyResult: {
    componentId: string
    currentPower: number
    monthUsage: number
    series: EnergySeriesPoint[]
    todayUsage: number
    updatedAt?: string
  } | null
  projectId: string
  queryResults: Array<{
    componentId: string
    componentName: string
    energyLevel: string
    levelName: string
    predictedUsage: number
    zoneName: string
  }>
  selectedComponentId: string | null
  selectedComponentName: string
}

interface AgentChatRequestBody {
  context: EnergyAssistantContextPayload
  prompt: string
  sessionId?: string | null
}

function buildContextPrompt(prompt: string, context: EnergyAssistantContextPayload) {
  const lines: string[] = [
    '你是建筑能耗与智慧运维助手，请使用简体中文回答。',
    `当前项目：${context.projectId}`,
    `当前选中构件：${context.selectedComponentName}${context.selectedComponentId ? ` (${context.selectedComponentId})` : ''}`,
  ]

  if (context.energyResult) {
    lines.push(
      `实时功率：${context.energyResult.currentPower.toFixed(1)} kW`,
      `今日累计：${context.energyResult.todayUsage.toFixed(1)} kWh`,
      `本月累计：${context.energyResult.monthUsage.toFixed(1)} kWh`,
    )

    if (context.energyResult.series.length > 0) {
      lines.push(
        `分时曲线：${context.energyResult.series
          .map((point) => `${point.time}=${point.value}`)
          .join('，')}`,
      )
    }
  } else {
    lines.push('当前还没有选中构件的实时能耗 JSON。')
  }

  if (context.queryResults.length > 0) {
    const topResults = context.queryResults
      .slice(0, 5)
      .map(
        (item, index) =>
          `${index + 1}. ${item.componentName}，位置 ${item.levelName}/${item.zoneName}，预测能耗 ${item.predictedUsage} kWh，等级 ${item.energyLevel}`,
      )
      .join('\n')

    lines.push(`当前筛选结果 Top 5：\n${topResults}`)
  } else {
    lines.push('当前筛选结果为空。')
  }

  lines.push(`用户问题：${prompt}`)
  lines.push('请结合这些上下文给出明确、实用、简洁的回答。')

  return lines.join('\n')
}

function extractReplyText(payload: any) {
  return (
    payload?.output?.text ??
    payload?.output?.message?.content?.[0]?.text ??
    payload?.output?.choices?.[0]?.message?.content ??
    null
  )
}

export const runtime = 'nodejs'

const DASHSCOPE_API_KEY = 'sk-6fc15a911c38434eb98142fd9f813bcc'
const BAILIAN_APP_ID = '72ad916a886f4e4080789c1b0f0e76db'

export async function POST(request: NextRequest) {
  const apiKey = DASHSCOPE_API_KEY
  const appId = BAILIAN_APP_ID

  let body: AgentChatRequestBody

  try {
    body = (await request.json()) as AgentChatRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!body?.prompt?.trim()) {
    return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 })
  }

  const upstreamPayload = {
    input: {
      prompt: buildContextPrompt(body.prompt.trim(), body.context),
      ...(body.sessionId ? { session_id: body.sessionId } : {}),
    },
    parameters: {},
    debug: {},
  }

  try {
    const upstreamResponse = await fetch(
      `https://dashscope.aliyuncs.com/api/v1/apps/${appId}/completion`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(upstreamPayload),
        cache: 'no-store',
      },
    )

    const responseText = await upstreamResponse.text()
    const responseJson = responseText ? JSON.parse(responseText) : null

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        {
          error:
            responseJson?.message ??
            responseJson?.code ??
            `Bailian request failed with status ${upstreamResponse.status}.`,
        },
        { status: upstreamResponse.status },
      )
    }

    const reply = extractReplyText(responseJson)

    if (!reply) {
      return NextResponse.json(
        { error: 'Bailian returned an empty reply.' },
        { status: 502 },
      )
    }

    return NextResponse.json({
      reply,
      sessionId: responseJson?.output?.session_id ?? body.sessionId ?? null,
      requestId: responseJson?.request_id ?? null,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to contact Bailian.',
      },
      { status: 500 },
    )
  }
}
