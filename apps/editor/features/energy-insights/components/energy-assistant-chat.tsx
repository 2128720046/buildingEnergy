'use client'

import { useEffect, useRef, useState } from 'react'
import {
  buildEnergyAssistantReply,
  type EnergyAssistantContext,
} from '@/features/energy-insights/lib/energy-assistant'
import { cn } from '@/lib/utils'

interface ChatMessage {
  content: string
  id: string
  role: 'assistant' | 'user'
}

interface AgentChatResponse {
  error?: string
  reply?: string
  sessionId?: string | null
}

const QUICK_PROMPTS = [
  '总结当前能耗情况',
  '峰值出现在什么时间段？',
  '给我三条优化建议',
  '列出当前高能耗对象',
]

function SendIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path
        d="M4 12.75 20 4l-4.18 16-4.98-5.04-4.3 2.57 1.31-5.38L4 12.75Z"
        fill="currentColor"
      />
    </svg>
  )
}

export interface EnergyAssistantChatProps extends EnergyAssistantContext {
  onJumpToLevel3HighlightZones?: () => void
  tone?: 'dark' | 'light'
  variant?: 'panel' | 'workspace'
}

export default function EnergyAssistantChat({
  onJumpToLevel3HighlightZones,
  tone = 'dark',
  variant = 'panel',
  ...context
}: EnergyAssistantChatProps) {
  const [draft, setDraft] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'assistant-welcome',
      role: 'assistant',
      content:
        '我已经接入智能体。你可以直接问我当前构件的能耗趋势、峰值成因、节能建议，或者让我结合筛选结果做分析。',
    },
  ])
  const scrollAnchorRef = useRef<HTMLDivElement>(null)
  const pendingJumpTimerRef = useRef<number | null>(null)

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isSubmitting])

  useEffect(() => {
    return () => {
      if (pendingJumpTimerRef.current !== null) {
        window.clearTimeout(pendingJumpTimerRef.current)
      }
    }
  }, [])

  const isWorkspace = variant === 'workspace'
  const isLight = tone === 'light'
  const workspaceContainerClass = isWorkspace
    ? isLight
      ? 'flex min-h-0 max-h-[calc(100dvh-180px)] flex-col overflow-hidden rounded-sm p-4'
      : 'flex h-full min-h-0 max-h-[calc(100dvh-220px)] flex-col overflow-hidden rounded-sm p-4'
    : ''
  const messageAreaClass = isWorkspace
    ? isLight
      ? 'h-[600px]'
      : 'min-h-0 flex-1'
    : 'h-[300px]'

  const submitPrompt = async (rawPrompt: string) => {
    const prompt = rawPrompt.trim()
    if (!prompt || isSubmitting) return

    const compactPrompt = prompt.replace(/\s+/g, '')
    const shouldJumpToLevel3 = compactPrompt.includes('那层楼有问题')

    if (shouldJumpToLevel3 && onJumpToLevel3HighlightZones) {
      if (pendingJumpTimerRef.current !== null) {
        window.clearTimeout(pendingJumpTimerRef.current)
      }
      pendingJumpTimerRef.current = window.setTimeout(() => {
        onJumpToLevel3HighlightZones()
      }, 5000)
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
    }

    setMessages((current) => [...current, userMessage])
    setDraft('')
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/agent-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          sessionId,
          context,
        }),
      })

      const payload = (await response.json()) as AgentChatResponse

      if (!response.ok || !payload.reply) {
        throw new Error(payload.error || '智能体未返回有效内容。')
      }

      setSessionId(payload.sessionId ?? null)
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: payload.reply ?? '',
        },
      ])
    } catch (error) {
      const fallback = buildEnergyAssistantReply(prompt, context)
      const errorText = error instanceof Error ? error.message : '未知错误'

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: `智能体暂时不可用，我先用本地分析兜底。\n错误原因：${errorText}\n\n${fallback}`,
        },
      ])
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section
      className={cn(
        'rounded-2xl border p-4 shadow-sm',
        workspaceContainerClass,
        isLight
          ? 'border-slate-200/80 bg-white'
          : isWorkspace
            ? 'border-cyan-300/16 bg-[#050505] shadow-[inset_0_1px_0_rgba(148,163,184,0.05)]'
            : 'border-cyan-300/20 bg-[#0f172a] shadow-[inset_0_1px_0_rgba(148,163,184,0.08)]',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div
            className={cn(
              'text-xs font-semibold tracking-[0.22em] uppercase',
              isLight ? 'text-slate-400' : 'text-slate-400',
            )}
          >
            Agent
          </div>
          <h3 className={cn('mt-2 font-semibold', isLight ? 'text-slate-950' : 'text-white')}>
            智能体问答
          </h3>
        </div>
        <div
          className={cn(
            'rounded-full px-3 py-1 text-xs',
            isLight
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
          )}
        >
          已接入智能体
        </div>
      </div>

      <div className={cn('mt-4 flex flex-wrap gap-2', isWorkspace && 'gap-2.5')}>
        {QUICK_PROMPTS.map((prompt) => (
          <button
            className={cn(
              'rounded-full px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              isLight
                ? 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                : isWorkspace
                  ? 'border border-cyan-300/18 bg-[#111111] text-slate-100 hover:bg-[#181818]'
                  : 'border border-cyan-300/20 bg-[#111c31] text-slate-100 hover:bg-[#16253f]',
            )}
            disabled={isSubmitting}
            key={prompt}
            onClick={() => void submitPrompt(prompt)}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div
        className={cn(
          'mt-4 min-h-0 space-y-3 overflow-y-auto rounded-2xl border p-3',
          messageAreaClass,
          isLight
            ? 'border-slate-200 bg-slate-50/90'
            : isWorkspace
              ? 'border-cyan-300/14 bg-[#090909]'
              : 'border-cyan-300/18 bg-[#0b1426]',
        )}
        style={isWorkspace && isLight ? { height: 600, maxHeight: 600 } : undefined}
      >
        {messages.map((message) => (
          <div
            className={message.role === 'assistant' ? 'flex justify-start' : 'flex justify-end'}
            key={message.id}
          >
            <div
              className={cn(
                'max-w-[90%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line',
                message.role === 'assistant'
                  ? isLight
                    ? 'rounded-bl-md border border-slate-200 bg-white text-slate-700'
                    : isWorkspace
                      ? 'rounded-bl-md border border-cyan-300/16 bg-[#111111] text-slate-100'
                      : 'rounded-bl-md border border-cyan-300/18 bg-[#111d34] text-slate-100'
                  : 'rounded-br-md bg-cyan-600 text-white',
              )}
            >
              {message.content}
            </div>
          </div>
        ))}

        {isSubmitting ? (
          <div className="flex justify-start">
            <div
              className={cn(
                'max-w-[90%] rounded-2xl rounded-bl-md border px-3 py-2 text-sm',
                isLight
                  ? 'border-slate-200 bg-white text-slate-700'
                  : isWorkspace
                    ? 'border-cyan-300/16 bg-[#111111] text-slate-100'
                    : 'border-cyan-300/18 bg-[#111d34] text-slate-100',
              )}
            >
              智能体正在思考...
            </div>
          </div>
        ) : null}

        <div ref={scrollAnchorRef} />
      </div>

      <form
        className={cn('mt-4 flex shrink-0 items-end gap-3', isWorkspace && 'gap-4')}
        onSubmit={(event) => {
          event.preventDefault()
          void submitPrompt(draft)
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">输入问题</span>
          <textarea
            className={cn(
              'w-full resize-none rounded-2xl border px-3 py-3 text-sm outline-none',
              isWorkspace ? 'min-h-[88px]' : 'min-h-[92px]',
              isLight
                ? 'border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:border-slate-300'
                : isWorkspace
                  ? 'border-cyan-300/16 bg-[#0f0f0f] text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/30'
                  : 'border-cyan-300/20 bg-[#0d182c] text-slate-100 placeholder:text-slate-500 focus:border-cyan-300/35',
            )}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="例如：帮我解释这个构件为什么峰值偏高，或者给我三条节能建议。"
            value={draft}
          />
        </label>

        <button
          className={cn(
            'inline-flex h-11 items-center gap-2 rounded-2xl px-4 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70',
            isLight
              ? 'bg-slate-900 text-white hover:bg-slate-800'
              : 'bg-cyan-600 text-white hover:bg-cyan-500',
          )}
          disabled={isSubmitting}
          type="submit"
        >
          <SendIcon />
          发送
        </button>
      </form>
    </section>
  )
}
