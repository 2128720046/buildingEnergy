'use client'

import type { ReactNode } from 'react'
import type { EditorProps } from './editor'
import { AutoModelingImporter } from './ui/auto-modeling-importer'
import { ActionMenu } from './ui/action-menu'
import { ViewerToolbarLeft, ViewerToolbarRight } from './ui/viewer-toolbar'
import { SettingsPanel, type SettingsPanelProps } from './ui/sidebar/panels/settings-panel'
import { SitePanel, type SitePanelProps } from './ui/sidebar/panels/site-panel'
import { ZoneComponentPanel } from './ui/zone-component-panel'
import { cn } from '../lib/utils'

export type ModelingSidebarTabDefinition = NonNullable<EditorProps['sidebarTabs']>[number]

export interface ModelingSidebarTabsOptions {
  sitePanelProps?: SitePanelProps
  settingsPanelProps?: SettingsPanelProps
  includeSiteTab?: boolean
  includeSettingsTab?: boolean
  includeAutoModelingTab?: boolean
  includeZoneMappingTab?: boolean
}

function AutoModelTab() {
  return (
    <div className="h-full overflow-auto p-4">
      <AutoModelingImporter />
    </div>
  )
}

function ZoneMapTab() {
  return (
    <div className="h-full overflow-auto p-4">
      <ZoneComponentPanel />
    </div>
  )
}

/** 宿主可直接复用的“场景树”侧栏标签。 */
export function createModelingSiteSidebarTab(
  sitePanelProps?: SitePanelProps,
): ModelingSidebarTabDefinition {
  function SiteSidebarTabComponent() {
    return <SitePanel {...sitePanelProps} />
  }

  return {
    id: 'site',
    label: '场景',
    component: SiteSidebarTabComponent,
  }
}

/** 宿主可直接复用的“设置”侧栏标签。 */
export function createModelingSettingsSidebarTab(
  settingsPanelProps?: SettingsPanelProps,
): ModelingSidebarTabDefinition {
  function SettingsSidebarTabComponent() {
    return <SettingsPanel {...settingsPanelProps} />
  }

  return {
    id: 'settings',
    label: '设置',
    component: SettingsSidebarTabComponent,
  }
}

/** 宿主可直接复用的“自动建模”侧栏标签。 */
export function createModelingAutoModelSidebarTab(): ModelingSidebarTabDefinition {
  return {
    id: 'auto-model',
    label: '自动建模',
    component: AutoModelTab,
  }
}

/** 宿主可直接复用的“区域映射”侧栏标签。 */
export function createModelingZoneMappingSidebarTab(): ModelingSidebarTabDefinition {
  return {
    id: 'zone-mapping',
    label: '区域映射',
    component: ZoneMapTab,
  }
}

/**
 * 默认侧栏标签装配器。
 * 宿主可以直接调用，也可以只挑其中几个标签自行组合。
 */
export function createDefaultModelingSidebarTabs({
  sitePanelProps,
  settingsPanelProps,
  includeSiteTab = true,
  includeSettingsTab = false,
  includeAutoModelingTab = true,
  includeZoneMappingTab = true,
}: ModelingSidebarTabsOptions = {}): ModelingSidebarTabDefinition[] {
  const tabs: ModelingSidebarTabDefinition[] = []

  if (includeSiteTab) {
    tabs.push(createModelingSiteSidebarTab(sitePanelProps))
  }
  if (includeSettingsTab) {
    tabs.push(createModelingSettingsSidebarTab(settingsPanelProps))
  }
  if (includeAutoModelingTab) {
    tabs.push(createModelingAutoModelSidebarTab())
  }
  if (includeZoneMappingTab) {
    tabs.push(createModelingZoneMappingSidebarTab())
  }

  return tabs
}

/** 默认左侧工具栏模块，宿主可以直接挂，也可以替换成自己的实现。 */
export function DefaultModelingViewerToolbarLeft() {
  return <ViewerToolbarLeft />
}

/** 默认右侧工具栏模块，宿主可以直接挂，也可以替换成自己的实现。 */
export function DefaultModelingViewerToolbarRight() {
  return <ViewerToolbarRight />
}

export interface ModelingHostToolboxProps {
  className?: string
  variant?: 'panel' | 'compact'
}

/**
 * 宿主工具箱模块。
 *
 * 这个组件把原本分散在编辑区顶部和底部的常用编辑工具重新组装成一个可嵌入模块，
 * 宿主前端可以把它放进右侧折叠栏，而不用继续使用编辑区内的悬浮工具。
 */
export function ModelingHostToolbox({ className, variant = 'panel' }: ModelingHostToolboxProps) {
  const isCompact = variant === 'compact'

  return (
    <div className={cn(isCompact ? 'space-y-2' : 'space-y-4', className)}>
      <section
        className={cn(
          'border border-border/60 bg-background/85 shadow-sm backdrop-blur-sm',
          isCompact ? 'rounded-xl p-2' : 'rounded-2xl p-4',
        )}
      >
        {!isCompact ? (
          <div className="mb-3 text-xs font-semibold tracking-[0.24em] text-muted-foreground uppercase">
            视图工具
          </div>
        ) : null}

        <div className={cn('flex gap-2', isCompact ? 'flex-col' : 'flex-col gap-3')}>
          <div className={cn(isCompact ? 'flex flex-col gap-2 [&>*]:w-full' : 'flex flex-wrap gap-2')}>
            <ViewerToolbarLeft />
          </div>
          <div className={cn(isCompact ? '[&>*]:w-full' : 'flex flex-wrap gap-2')}>
            <ViewerToolbarRight />
          </div>
        </div>
      </section>

      <section
        className={cn(
          'border border-border/60 bg-background/85 shadow-sm backdrop-blur-sm',
          isCompact ? 'rounded-xl p-2' : 'rounded-2xl p-4',
        )}
      >
        {!isCompact ? (
          <div className="mb-3 text-xs font-semibold tracking-[0.24em] text-muted-foreground uppercase">
            编辑工具
          </div>
        ) : null}

        <ActionMenu layout="embedded" />
      </section>
    </div>
  )
}

export interface ModelingModuleNavbarProps {
  title?: string
  description?: string
  logoSrc?: string
  actions?: ReactNode
}

/**
 * 宿主导航头模块。
 * 这个组件不依赖编辑器内部状态，只负责显示品牌、标题和宿主自己的操作区。
 */
export function ModelingModuleNavbar({
  title = '建模工作台',
  description = '编辑器壳层已经外置，宿主前端可以自由组装顶部导航、侧栏标签和业务面板。',
  logoSrc = '/pascal-logo-full.svg',
  actions,
}: ModelingModuleNavbarProps) {
  return (
    <header className="border-b border-border bg-card/95 px-5 py-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <img alt="Pascal" className="mt-1 h-8 w-auto shrink-0" src={logoSrc} />
          <div className="min-w-0">
            <div className="text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
              外部装配导航模块
            </div>
            <h2 className="mt-2 truncate font-semibold text-foreground text-lg">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>

        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}