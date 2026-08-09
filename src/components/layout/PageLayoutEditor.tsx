import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { Dispatch, DragEvent, KeyboardEvent, ReactNode, SetStateAction } from "react"
import { LayoutTemplate, Plus, RotateCcw, Save, X } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  PageComponent,
  defaultConfigForPageComponent,
  defaultWidthForPageComponent,
  pageComponentDescription,
  pageComponentLabel,
  pageComponentPresets,
} from "@/components/dashboard/DashboardWidgets"
import { useToast } from "@/components/ui/toast"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import {
  DASHBOARD_PAGE_KEY,
  clonePageSlots,
  clearActivePageComponentDragData,
  ensureEditablePageSlots,
  getPageSlotItems,
  newPageComponentItem,
  pageComponentDragType,
  pageKeyFromPathname,
  parsePageLayouts,
  serializePageLayouts,
  setActivePageComponentDragData,
} from "@/lib/page-layouts"
import type { PageComponentConfig, PageComponentItem, PageComponentWidth, PageLayouts, PageSlotKey } from "@/lib/page-layouts"

interface PageLayoutEditorProviderProps {
  children: ReactNode
  currentPageKey: string
  isEditing: boolean
  pageLayoutsRaw: string
  onEditingChange: (editing: boolean) => void
  saveEndpoint?: string
}

interface PageLayoutEditorContextValue {
  isEditing: boolean
  isSaving: boolean
  currentPageKey: string
  language: string
  copy: LayoutEditorCopy
  addComponent: (pageKey: string, slotKey: PageSlotKey, type: string, index?: number) => void
  addComponentToEnd: (type: string) => void
  cancelEditing: () => void
  deleteComponent: (pageKey: string, slotKey: PageSlotKey, id: string) => void
  getItems: (pageKey: string, slotKey: PageSlotKey, defaultItems?: PageComponentItem[]) => PageComponentItem[]
  moveComponent: (pageKey: string, slotKey: PageSlotKey, index: number, direction: -1 | 1) => void
  moveComponentTo: (pageKey: string, fromSlotKey: PageSlotKey, fromIndex: number, toSlotKey: PageSlotKey, toIndex: number) => void
  resetCurrentPage: () => void
  saveEditing: () => void
  updateComponentConfig: (pageKey: string, slotKey: PageSlotKey, id: string, config: PageComponentConfig) => void
  updateComponentWidth: (pageKey: string, slotKey: PageSlotKey, id: string, width: PageComponentWidth) => void
}

const PageLayoutEditorContext = createContext<PageLayoutEditorContextValue | null>(null)

export function PageLayoutEditorProvider({
  children,
  currentPageKey,
  isEditing,
  pageLayoutsRaw,
  onEditingChange,
  saveEndpoint = "/settings",
}: PageLayoutEditorProviderProps) {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const savedLayouts = useMemo(() => parsePageLayouts(pageLayoutsRaw), [pageLayoutsRaw])
  const [draftLayouts, setDraftLayouts] = useState<PageLayouts>(savedLayouts)
  const normalizedCurrentPage = pageKeyFromPathname(currentPageKey)

  useEffect(() => {
    if (!isEditing) {
      setDraftLayouts(savedLayouts)
    }
  }, [isEditing, savedLayouts])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(saveEndpoint, {
        page_layouts: serializePageLayouts(draftLayouts),
      })
      return res.data
    },
    onSuccess: () => {
      success(copy.saved)
      queryClient.invalidateQueries({ queryKey: ["public-settings"] })
      queryClient.invalidateQueries({ queryKey: ["settings"] })
      queryClient.invalidateQueries({ queryKey: ["enterprise-portal"] })
      onEditingChange(false)
    },
    onError: () => error(copy.saveFailed),
  })

  const value: PageLayoutEditorContextValue = {
    isEditing,
    isSaving: saveMutation.isPending,
    currentPageKey: normalizedCurrentPage,
    language,
    copy,
    addComponent: (pageKey, slotKey, type, index) => {
      const component = newPageComponentItem(type, defaultWidthForPageComponent(type), defaultConfigForPageComponent(type))
      updateSlot(setDraftLayouts, pageKey, slotKey, (items) => {
        if (typeof index !== "number") {
          return [...items, component]
        }
        const next = [...items]
        next.splice(Math.max(0, Math.min(index, next.length)), 0, component)
        return next
      })
    },
    addComponentToEnd: (type) => {
      const slotKey = normalizedCurrentPage === DASHBOARD_PAGE_KEY ? "main" : "after"
      const component = newPageComponentItem(type, defaultWidthForPageComponent(type), defaultConfigForPageComponent(type))
      updateSlot(setDraftLayouts, normalizedCurrentPage, slotKey, (items) => [...items, component])
    },
    cancelEditing: () => {
      setDraftLayouts(savedLayouts)
      onEditingChange(false)
    },
    deleteComponent: (pageKey, slotKey, id) => {
      updateSlot(setDraftLayouts, pageKey, slotKey, (items) => items.filter((item) => item.id !== id))
    },
    getItems: (pageKey, slotKey, defaultItems = []) => {
      const source = isEditing ? draftLayouts : savedLayouts
      const normalizedPageKey = pageKeyFromPathname(pageKey)
      if (isEditing && normalizedPageKey === DASHBOARD_PAGE_KEY) {
        const editableSlots = ensureEditablePageSlots(source, normalizedPageKey)
        return getPageSlotItems({ [normalizedPageKey]: editableSlots }, normalizedPageKey, slotKey, defaultItems)
      }
      return getPageSlotItems(source, normalizedPageKey, slotKey, defaultItems)
    },
    moveComponent: (pageKey, slotKey, index, direction) => {
      updateSlot(setDraftLayouts, pageKey, slotKey, (items) => {
        const next = [...items]
        const targetIndex = index + direction
        if (targetIndex < 0 || targetIndex >= next.length) {
          return next
        }
        const [item] = next.splice(index, 1)
        next.splice(targetIndex, 0, item)
        return next
      })
    },
    moveComponentTo: (pageKey, fromSlotKey, fromIndex, toSlotKey, toIndex) => {
      setDraftLayouts((current) => {
        const normalizedPageKey = pageKeyFromPathname(pageKey)
        const pageSlots = normalizedPageKey === DASHBOARD_PAGE_KEY
          ? ensureEditablePageSlots(current, normalizedPageKey)
          : clonePageSlots(current[normalizedPageKey])
        const fromItems = [...(pageSlots[fromSlotKey] || [])]
        if (fromIndex < 0 || fromIndex >= fromItems.length) {
          return current
        }
        const [item] = fromItems.splice(fromIndex, 1)
        const toItems = fromSlotKey === toSlotKey ? fromItems : [...(pageSlots[toSlotKey] || [])]
        const adjustedIndex = fromSlotKey === toSlotKey && fromIndex < toIndex ? toIndex - 1 : toIndex
        const boundedIndex = Math.max(0, Math.min(adjustedIndex, toItems.length))
        toItems.splice(boundedIndex, 0, item)
        pageSlots[fromSlotKey] = fromSlotKey === toSlotKey ? toItems : fromItems
        if (fromSlotKey !== toSlotKey) {
          pageSlots[toSlotKey] = toItems
        }
        return {
          ...current,
          [normalizedPageKey]: pageSlots,
        }
      })
    },
    resetCurrentPage: () => {
      setDraftLayouts((current) => {
        const next = { ...current }
        delete next[normalizedCurrentPage]
        return next
      })
    },
    saveEditing: () => saveMutation.mutate(),
    updateComponentConfig: (pageKey, slotKey, id, config) => {
      updateSlot(setDraftLayouts, pageKey, slotKey, (items) => items.map((item) => (item.id === id ? { ...item, config } : item)))
    },
    updateComponentWidth: (pageKey, slotKey, id, width) => {
      updateSlot(setDraftLayouts, pageKey, slotKey, (items) => items.map((item) => (item.id === id ? { ...item, width } : item)))
    },
  }

  return <PageLayoutEditorContext.Provider value={value}>{children}</PageLayoutEditorContext.Provider>
}

export function PageLayoutEditBar() {
  const editor = usePageLayoutEditor()
  const [isLibraryOpen, setIsLibraryOpen] = useState(false)
  if (!editor?.isEditing) {
    return null
  }

  const pageLabel = pageLabelForKey(editor.currentPageKey, editor.copy)

  return (
    <div className="z-20 border-b bg-card/95 px-4 py-3 shadow-sm sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background">
            <LayoutTemplate className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{editor.copy.visualEditing}</div>
            <div className="truncate text-xs text-muted-foreground">{pageLabel}</div>
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="gap-2" onClick={() => setIsLibraryOpen(true)}>
              <Plus className="h-4 w-4" />
              {editor.copy.addComponent}
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={editor.resetCurrentPage}>
              <RotateCcw className="h-4 w-4" />
              {editor.copy.reset}
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={editor.cancelEditing}>
              <X className="h-4 w-4" />
              {editor.copy.exit}
            </Button>
            <Button type="button" size="sm" className="gap-2" onClick={editor.saveEditing} disabled={editor.isSaving}>
              <Save className="h-4 w-4" />
              {editor.isSaving ? editor.copy.saving : editor.copy.save}
            </Button>
          </div>
        </div>
      </div>
      <ComponentLibraryDialog open={isLibraryOpen} onOpenChange={setIsLibraryOpen} editor={editor} />
    </div>
  )
}

export function usePageLayoutEditor() {
  return useContext(PageLayoutEditorContext)
}

function ComponentLibraryDialog({
  editor,
  onOpenChange,
  open,
}: {
  editor: NonNullable<ReturnType<typeof usePageLayoutEditor>>
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const addPreset = (type: string) => {
    editor.addComponentToEnd(type)
    onOpenChange(false)
  }
  const startPresetDrag = (event: DragEvent<HTMLDivElement>, type: string) => {
    const dragData = { action: "create" as const, type }
    setActivePageComponentDragData(dragData)
    window.addEventListener("dragend", clearActivePageComponentDragData, { once: true })
    event.dataTransfer.effectAllowed = "copy"
    event.dataTransfer.setData(pageComponentDragType, JSON.stringify(dragData))
    window.setTimeout(() => onOpenChange(false), 0)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[calc(100vw-2rem)] max-w-6xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{editor.copy.addComponent}</DialogTitle>
          <DialogDescription>{editor.copy.dragToPlace}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[68vh] gap-4 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
          {pageComponentPresets.map((preset) => {
            const label = pageComponentLabel(preset.type, editor.language)
            const description = pageComponentDescription(preset.type, editor.language)
            const Icon = preset.icon
            return (
              <div
                key={preset.type}
                role="button"
                tabIndex={0}
                draggable
                className="group rounded-md border bg-card p-3 text-left shadow-sm outline-none transition-colors hover:border-primary/60 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => addPreset(preset.type)}
                onDragStart={(event) => startPresetDrag(event, preset.type)}
                onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    addPreset(preset.type)
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{label}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{description}</div>
                    </div>
                  </div>
                  <div className="shrink-0 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">{editor.copy.addToEnd}</div>
                </div>
                <div className="mt-3 h-44 overflow-hidden rounded-md border bg-background p-2">
                  <div className="pointer-events-none w-[118%] origin-top-left scale-[0.85]">
                    <PageComponent type={preset.type} config={defaultConfigForPageComponent(preset.type)} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function updateSlot(
  setLayouts: Dispatch<SetStateAction<PageLayouts>>,
  pageKey: string,
  slotKey: PageSlotKey,
  updater: (items: PageComponentItem[]) => PageComponentItem[]
) {
  setLayouts((current) => {
    const normalizedPageKey = pageKeyFromPathname(pageKey)
    const pageSlots = normalizedPageKey === DASHBOARD_PAGE_KEY
      ? ensureEditablePageSlots(current, normalizedPageKey)
      : clonePageSlots(current[normalizedPageKey])
    pageSlots[slotKey] = updater([...(pageSlots[slotKey] || [])])
    return {
      ...current,
      [normalizedPageKey]: pageSlots,
    }
  })
}

function pageLabelForKey(pageKey: string, copy: LayoutEditorCopy) {
  const match = pageChoices(copy).find((page) => page.key === pageKeyFromPathname(pageKey))
  return match?.label || pageKey
}

function pageChoices(copy: LayoutEditorCopy) {
  return [
    { key: "/dashboard", label: copy.pageDashboard },
    { key: "/dashboard/data-board", label: copy.pageDataBoard },
    { key: "/dashboard/logs", label: copy.pageLogs },
    { key: "/dashboard/wallet", label: copy.pageWallet },
    { key: "/dashboard/api-keys", label: copy.pageApiKeys },
    { key: "/dashboard/settings", label: copy.pageSettings },
    { key: "/dashboard/admin-overview", label: copy.pageAdminOverview },
    { key: "/dashboard/admin/general", label: copy.pageSystem },
    { key: "/dashboard/admin/auth", label: copy.pageSystem },
    { key: "/dashboard/admin/content", label: copy.pageSystem },
    { key: "/dashboard/admin/operations", label: copy.pageSystem },
    { key: "/dashboard/channels", label: copy.pageChannels },
    { key: "/dashboard/models", label: copy.pageModels },
    { key: "/dashboard/users", label: copy.pageUsers },
  ]
}

interface LayoutEditorCopy {
  addAfter: string
  addBefore: string
  addComponent: string
  addMain: string
  addPrimary: string
  addSecondary: string
  addToEnd: string
  component: string
  delete: string
  dragComponentHere: string
  dragToPlace: string
  emptySlot: string
  exit: string
  moveDown: string
  moveUp: string
  pageAdminOverview: string
  pageAgents: string
  pageApiKeys: string
  pageChannels: string
  pageChat: string
  pageDashboard: string
  pageDataBoard: string
  pageImages: string
  pageLogs: string
  pageModels: string
  pageMCP: string
  pageSettings: string
  pageSkills: string
  pageSystem: string
  pageUsers: string
  pageWallet: string
  positionAfter: string
  positionBefore: string
  positionMain: string
  positionPrimary: string
  positionSecondary: string
  reset: string
  save: string
  saved: string
  saveFailed: string
  saving: string
  visualEditing: string
  width: string
  widthFull: string
  widthHalf: string
  widthThird: string
}

const zhCopy: LayoutEditorCopy = {
  addAfter: "插到下方",
  addBefore: "插到上方",
  addComponent: "添加组件",
  addMain: "插到首页",
  addPrimary: "插到中部",
  addSecondary: "插到后段",
  addToEnd: "点按添加",
  component: "预设组件",
  delete: "删除",
  dragComponentHere: "把组件拖到这里",
  dragToPlace: "点按组件会追加到页面末尾，也可以按住组件预览拖到指定空位。",
  emptySlot: "把组件拖到这里",
  exit: "退出",
  moveDown: "下移",
  moveUp: "上移",
  pageAdminOverview: "管理员概览",
  pageAgents: "代理",
  pageApiKeys: "API 密钥",
  pageChannels: "渠道",
  pageChat: "聊天",
  pageDashboard: "首页概览",
  pageDataBoard: "数据看板",
  pageImages: "AI 绘画",
  pageLogs: "明细",
  pageModels: "模型",
  pageMCP: "MCP",
  pageSettings: "设置",
  pageSkills: "技能",
  pageSystem: "系统设置",
  pageUsers: "用户",
  pageWallet: "钱包",
  positionAfter: "内容下方",
  positionBefore: "内容上方",
  positionMain: "首页主体",
  positionPrimary: "中部位置",
  positionSecondary: "后段位置",
  reset: "重置本页",
  save: "保存",
  saved: "页面组件已保存",
  saveFailed: "页面组件保存失败",
  saving: "保存中",
  visualEditing: "可视化编辑",
  width: "宽度",
  widthFull: "整行",
  widthHalf: "半行",
  widthThird: "三分之一",
}

const enCopy: LayoutEditorCopy = {
  addAfter: "Add below",
  addBefore: "Add above",
  addComponent: "Add component",
  addMain: "Add to dashboard",
  addPrimary: "Add middle",
  addSecondary: "Add lower",
  addToEnd: "Click to add",
  component: "Preset component",
  delete: "Delete",
  dragComponentHere: "Drag a component here",
  dragToPlace: "Click a component to append it to the end of the page, or drag a preview into a specific slot.",
  emptySlot: "Drag a component here",
  exit: "Exit",
  moveDown: "Move down",
  moveUp: "Move up",
  pageAdminOverview: "Admin overview",
  pageAgents: "Agents",
  pageApiKeys: "API keys",
  pageChannels: "Channels",
  pageChat: "Chat",
  pageDashboard: "Dashboard",
  pageDataBoard: "Data board",
  pageImages: "AI images",
  pageLogs: "Details",
  pageModels: "Models",
  pageMCP: "MCP",
  pageSettings: "Settings",
  pageSkills: "Skills",
  pageSystem: "System settings",
  pageUsers: "Users",
  pageWallet: "Wallet",
  positionAfter: "Below content",
  positionBefore: "Above content",
  positionMain: "Dashboard body",
  positionPrimary: "Middle position",
  positionSecondary: "Lower position",
  reset: "Reset page",
  save: "Save",
  saved: "Page components saved",
  saveFailed: "Failed to save page components",
  saving: "Saving",
  visualEditing: "Visual editing",
  width: "Width",
  widthFull: "Full row",
  widthHalf: "Half row",
  widthThird: "One third",
}
