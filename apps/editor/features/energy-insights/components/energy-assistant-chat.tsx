'use client'

import { useEffect, useRef, useState } from 'react'
import {
  buildEnergyAssistantReply,
  type EnergyAssistantContext,
} from '@/features/energy-insights/lib/energy-assistant'

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
  '峰值出现在什么时候？',
  '给我三条优化建议',
  '列出当前高耗能对象',
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

export interface EnergyAssistantChatProps extends EnergyAssistantContext {}

export default function EnergyAssistantChat(context: EnergyAssistantChatProps) {
  const [draft, setDraft] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'assistant-welcome',
      role: 'assistant',
      content:
        '我已经接入百炼智能体。你可以直接问我当前构件的能耗趋势、峰值原因、节能建议，或者让我结合筛选结果做分析。',
    },
  ])
  const scrollAnchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isSubmitting])

  const submitPrompt = async (rawPrompt: string) => {
    const prompt = rawPrompt.trim()
    if (!prompt || isSubmitting) return

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
        throw new Error(payload.error || '百炼智能体返回为空。')
      }

      const reply = payload.reply
      setSessionId(payload.sessionId ?? null)
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: reply,
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
          content: `百炼智能体暂时不可用，我先用本地分析兜底。\n错误原因：${errorText}\n\n${fallback}`,
        },
      ])
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">Agent</div>
          <h3 className="mt-2 font-semibold text-white">智能体问答</h3>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
          已接入百炼智能体
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            className="rounded-full border border-white/10 bg-black/10 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            key={prompt}
            onClick={() => void submitPrompt(prompt)}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="mt-4 max-h-[360px] space-y-3 overflow-auto rounded-2xl border border-white/8 bg-slate-950/45 p-3">
        {messages.map((message) => (
          <div
            className={message.role === 'assistant' ? 'flex justify-start' : 'flex justify-end'}
            key={message.id}
          >
            <div
              className={
                message.role === 'assistant'
                  ? 'max-w-[90%] rounded-2xl rounded-bl-md border border-white/8 bg-white/8 px-3 py-2 text-sm text-slate-100 whitespace-pre-line'
                  : 'max-w-[90%] rounded-2xl rounded-br-md bg-sky-500 px-3 py-2 text-sm text-white whitespace-pre-line'
              }
            >
              {message.content}
            </div>
          </div>
        ))}

        {isSubmitting ? (
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-white/8 bg-white/8 px-3 py-2 text-sm text-slate-100">
              百炼智能体正在思考...
            </div>
          </div>
        ) : null}

        <div ref={scrollAnchorRef} />
      </div>

      <form
        className="mt-4 flex items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submitPrompt(draft)
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">输入问题</span>
          <textarea
            className="min-h-[92px] w-full resize-none rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-white/20"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="例如：帮我解释这个构件为什么峰值高，或者给我三条节能建议。"
            value={draft}
          />
        </label>

        <button
          className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-100 px-4 font-medium text-slate-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
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
