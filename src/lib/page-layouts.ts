export const DASHBOARD_PAGE_KEY = "/dashboard"

export const pageSlotKeys = ["before", "main", "primary", "secondary", "after"] as const

export type PageSlotKey = (typeof pageSlotKeys)[number]

export type PageComponentWidth = "full" | "half" | "third"

export type PageComponentConfig = Record<string, string | number | boolean>

export interface PageComponentItem {
  id: string
  type: string
  width?: PageComponentWidth
  config?: PageComponentConfig
}

export type PageSlots = Partial<Record<PageSlotKey, PageComponentItem[]>>

export type PageLayouts = Record<string, PageSlots>

export const pageComponentDragType = "application/x-flai-page-component"

export type PageComponentDragData =
  | { action: "create"; type: string }
  | { action: "move"; pageKey: string; slotKey: PageSlotKey; index: number }

let activePageComponentDragData: PageComponentDragData | null = null

export function setActivePageComponentDragData(data: PageComponentDragData) {
  activePageComponentDragData = data
}

export function getActivePageComponentDragData() {
  return activePageComponentDragData
}

export function clearActivePageComponentDragData() {
  activePageComponentDragData = null
}

export const defaultDashboardComponents: PageComponentItem[] = [
  { id: "default-dashboard-stats", type: "dashboard_stats", width: "full" },
  { id: "default-dashboard-announcements", type: "announcements", width: "half" },
  { id: "default-dashboard-node-status", type: "node_status", width: "half" },
]

export function pageKeyFromPathname(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "") || DASHBOARD_PAGE_KEY
  return normalized === "/" ? DASHBOARD_PAGE_KEY : normalized
}

export function parsePageLayouts(raw?: string | null): PageLayouts {
  if (!raw || !raw.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }

    return Object.entries(parsed).reduce<PageLayouts>((layouts, [pageKey, pageValue]) => {
      if (!pageKey || !pageValue || typeof pageValue !== "object" || Array.isArray(pageValue)) {
        return layouts
      }

      const slots = pageSlotKeys.reduce<PageSlots>((pageSlots, slotKey) => {
        const slotValue = (pageValue as Record<string, unknown>)[slotKey]
        if (!Array.isArray(slotValue)) {
          return pageSlots
        }
        pageSlots[slotKey] = slotValue
          .map((item) => normalizeComponentItem(item))
          .filter((item): item is PageComponentItem => Boolean(item))
        return pageSlots
      }, {})

      layouts[pageKeyFromPathname(pageKey)] = slots
      return layouts
    }, {})
  } catch {
    return {}
  }
}

export function serializePageLayouts(layouts: PageLayouts) {
  return JSON.stringify(layouts)
}

export function getPageSlotItems(
  layouts: PageLayouts,
  pageKey: string,
  slotKey: PageSlotKey,
  defaultItems: PageComponentItem[] = []
) {
  const normalizedPageKey = pageKeyFromPathname(pageKey)
  const pageSlots = layouts[normalizedPageKey]
  if (!pageSlots || !Object.prototype.hasOwnProperty.call(pageSlots, slotKey)) {
    return defaultItems
  }
  return pageSlots[slotKey] || []
}

export function ensureEditablePageSlots(layouts: PageLayouts, pageKey: string): PageSlots {
  const normalizedPageKey = pageKeyFromPathname(pageKey)
  const slots = clonePageSlots(layouts[normalizedPageKey])

  if (normalizedPageKey === DASHBOARD_PAGE_KEY && !Object.prototype.hasOwnProperty.call(slots, "main")) {
    slots.main = defaultDashboardComponents
  }

  return slots
}

export function clonePageSlots(slots?: PageSlots): PageSlots {
  return pageSlotKeys.reduce<PageSlots>((copy, slotKey) => {
    if (slots && Object.prototype.hasOwnProperty.call(slots, slotKey)) {
      copy[slotKey] = [...(slots[slotKey] || [])]
    }
    return copy
  }, {})
}

export function newPageComponentItem(type: string, width: PageComponentWidth = "half", config?: PageComponentConfig): PageComponentItem {
  const item: PageComponentItem = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    type,
    width,
  }
  if (config && Object.keys(config).length > 0) {
    item.config = config
  }
  return item
}

function normalizeComponentItem(value: unknown): PageComponentItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const item = value as Record<string, unknown>
  const type = typeof item.type === "string" ? item.type.trim() : ""
  if (!type) {
    return null
  }

  const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : newPageComponentItem(type).id
  const component: PageComponentItem = {
    id,
    type,
    width: normalizeWidth(item.width),
  }
  const config = normalizeConfig(item.config)
  if (config) {
    component.config = config
  }
  return component
}

function normalizeWidth(value: unknown): PageComponentWidth {
  return value === "full" || value === "half" || value === "third" ? value : "half"
}

function normalizeConfig(value: unknown): PageComponentConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const config = Object.entries(value as Record<string, unknown>).reduce<PageComponentConfig>((next, [key, entry]) => {
    if (!key) {
      return next
    }
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
      next[key] = entry
    }
    return next
  }, {})

  return Object.keys(config).length > 0 ? config : undefined
}
