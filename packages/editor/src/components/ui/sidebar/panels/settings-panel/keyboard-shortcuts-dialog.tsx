import { Keyboard } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from './../../../../../components/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './../../../../../components/ui/primitives/dialog'
import { ShortcutToken } from './../../../../../components/ui/primitives/shortcut-token'

type Shortcut = {
  keys: string[]
  action: string
  note?: string
}

type ShortcutCategory = {
  title: string
  shortcuts: Shortcut[]
}

const KEY_DISPLAY_MAP: Record<string, string> = {
  'Arrow Up': '↑',
  'Arrow Down': '↓',
  Esc: '⎋',
  Shift: '⇧',
  Space: '␣',
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: '编辑器导航',
    shortcuts: [
      { keys: ['1'], action: '切换到场地阶段' },
      { keys: ['2'], action: '切换到结构阶段' },
      { keys: ['3'], action: '切换到布置阶段' },
      { keys: ['S'], action: '切换到结构层' },
      { keys: ['F'], action: '切换到布置层' },
      { keys: ['Z'], action: '切换到区域层' },
      {
        keys: ['Cmd/Ctrl', 'Arrow Up'],
        action: '选择当前建筑的上一层',
      },
      {
        keys: ['Cmd/Ctrl', 'Arrow Down'],
        action: '选择当前建筑的下一层',
      },
      { keys: ['Cmd/Ctrl', 'B'], action: '切换侧边栏显示状态' },
    ],
  },
  {
    title: '模式与历史',
    shortcuts: [
      { keys: ['V'], action: '切换到选择模式' },
      { keys: ['B'], action: '切换到建模模式' },
      {
        keys: ['Esc'],
        action: '取消当前工具并回到选择模式',
      },
      { keys: ['Delete / Backspace'], action: '删除当前选中对象' },
      { keys: ['Cmd/Ctrl', 'Z'], action: '撤销' },
      { keys: ['Cmd/Ctrl', 'Shift', 'Z'], action: '重做' },
    ],
  },
  {
    title: '选择',
    shortcuts: [
      {
        keys: ['Cmd/Ctrl', 'Left click'],
        action: '将对象加入或移出多选集合',
        note: '仅在选择模式下生效。',
      },
    ],
  },
  {
    title: '绘制工具',
    shortcuts: [
      {
        keys: ['Shift'],
        action: '绘制墙体、楼板、吊顶时临时关闭角度吸附',
        note: '绘制过程中按住不放。',
      },
    ],
  },
  {
    title: '构件放置',
    shortcuts: [
      { keys: ['R'], action: '将构件顺时针旋转 90 度' },
      { keys: ['T'], action: '将构件逆时针旋转 90 度' },
      {
        keys: ['Shift'],
        action: '临时跳过放置约束校验',
        note: '放置过程中按住不放。',
      },
    ],
  },
  {
    title: '相机',
    shortcuts: [
      {
        keys: ['Middle click'],
        action: '平移相机',
        note: '按住鼠标中键拖动，或按住空格后用左键拖动。',
      },
      {
        keys: ['Right click'],
        action: '环绕相机',
        note: '按住鼠标右键拖动。',
      },
    ],
  },
]

function getDisplayKey(key: string, isMac: boolean): string {
  if (key === 'Cmd/Ctrl') return isMac ? '⌘' : 'Ctrl'
  if (key === 'Delete / Backspace') return isMac ? '⌫' : 'Backspace'
  return KEY_DISPLAY_MAP[key] ?? key
}

function ShortcutKeys({ keys }: { keys: string[] }) {
  const [isMac, setIsMac] = useState(true)

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') >= 0)
  }, [])

  return (
    <div className="flex flex-wrap items-center gap-1">
      {keys.map((key, index) => (
        <div className="flex items-center gap-1" key={`${key}-${index}`}>
          {index > 0 ? <span className="text-[10px] text-muted-foreground">+</span> : null}
          <ShortcutToken displayValue={getDisplayKey(key, isMac)} value={key} />
        </div>
      ))}
    </div>
  )
}

export function KeyboardShortcutsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full justify-start gap-2" variant="outline">
          <Keyboard className="size-4" />
          查看快捷键
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>快捷键说明</DialogTitle>
          <DialogDescription>
            快捷键与当前阶段、当前工具有关，不同上下文下行为会不同。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {SHORTCUT_CATEGORIES.map((category) => (
            <section className="space-y-2" key={category.title}>
              <h3 className="font-medium text-sm">{category.title}</h3>
              <div className="overflow-hidden rounded-md border border-border/80">
                {category.shortcuts.map((shortcut, index) => (
                  <div
                    className="grid grid-cols-[minmax(130px,220px)_1fr] gap-3 px-3 py-2"
                    key={`${category.title}-${shortcut.action}`}
                  >
                    <ShortcutKeys keys={shortcut.keys} />
                    <div>
                      <p className="text-sm">{shortcut.action}</p>
                      {shortcut.note ? (
                        <p className="text-muted-foreground text-xs">{shortcut.note}</p>
                      ) : null}
                    </div>
                    {index < category.shortcuts.length - 1 ? (
                      <div className="col-span-2 border-border/60 border-b" />
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
