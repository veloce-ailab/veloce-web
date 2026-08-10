import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"
import { Fragment, useState } from "react"
import type { DragEvent, ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { PageComponent, defaultWidthForPageComponent, pageComponentLabel, pageComponentPresets } from "@/components/dashboard/DashboardWidgets"
import { usePageLayoutEditor } from "@/components/layout/PageLayoutEditor"
import api from "@/lib/api"
import {
  DASHBOARD_PAGE_KEY,
  clearActivePageComponentDragData,
  getActivePageComponentDragData,
  getPageSlotItems,
  pageComponentDragType,
  pageKeyFromPathname,
  parsePageLayouts,
  setActivePageComponentDragData,
} from "@/lib/page-layouts"
import type { PageComponentConfig, PageComponentDragData, PageComponentItem, PageComponentWidth, PageSlotKey } from "@/lib/page-layouts"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"
import { cn } from "@/lib/utils"

interface PageComponentSlotsProps {
  pageKey: string
  slotKey: PageSlotKey
  defaultItems?: PageComponentItem[]
  className?: string
}

const widthClasses: Record<PageComponentWidth, string> = {
  full: "lg:col-span-6",
  half: "lg:col-span-3",
  third: "lg:col-span-2",
}

const widthColumns: Record<PageComponentWidth, number> = {
  full: 6,
  half: 3,
  third: 2,
}

interface DropTarget {
  index: number
  width: PageComponentWidth
  fullRow: boolean
}

const selectClass =
  "h-8 rounded-2xl border border-input bg-background px-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

export function PageComponentSlots({ pageKey, slotKey, defaultItems = [], className }: PageComponentSlotsProps) {
  const editor = usePageLayoutEditor()
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
    enabled: !editor?.isEditing,
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const normalizedPageKey = pageKeyFromPathname(pageKey)
  const savedItems = getPageSlotItems(parsePageLayouts(publicSettings.page_layouts), normalizedPageKey, slotKey, defaultItems)
  const items = (editor ? editor.getItems(normalizedPageKey, slotKey, defaultItems) : savedItems).filter((item) =>
    pageComponentPresets.some((preset) => preset.type === item.type)
  )

  if (!editor?.isEditing && items.length === 0) {
    return null
  }

  if (editor?.isEditing) {
    return (
      <EditableSlot
        className={className}
        editor={editor}
        items={items}
        pageKey={normalizedPageKey}
        slotKey={slotKey}
      />
    )
  }

  return (
    <div className={cn("grid gap-6 lg:grid-cols-6", className)}>
      {items.map((item) => (
        <div key={item.id} className={cn("min-w-0", widthClasses[item.width || "half"])}>
          <PageComponent item={item} />
        </div>
      ))}
    </div>
  )
}

function EditableSlot({
  className,
  editor,
  items,
  pageKey,
  slotKey,
}: {
  className?: string
  editor: NonNullable<ReturnType<typeof usePageLayoutEditor>>
  items: PageComponentItem[]
  pageKey: string
  slotKey: PageSlotKey
}) {
  const label = slotLabel(pageKey, slotKey, editor.copy)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  return (
    <section
      className={cn("rounded-md border border-dashed border-primary/40 bg-primary/5 p-3", className)}
      onDragOver={(event) => {
        if (hasComponentDragData(event)) {
          event.preventDefault()
          const source = dragSourceForEvent(event)
          if (source && isAllowedDropSource(source, pageKey)) {
            setDropTarget((current) => current || dropTargetForEnd(items, source, editor, pageKey, slotKey))
          }
        }
      }}
      onDrop={(event) => {
        const source = dragSourceForEvent(event)
        if (!source || (source.action === "move" && source.pageKey !== pageKey)) {
          return
        }
        event.preventDefault()
        placeDraggedComponent(editor, pageKey, slotKey, dropTarget?.index ?? items.length, source)
        setDropTarget(null)
        clearActivePageComponentDragData()
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDropTarget(null)
        }
      }}
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{editor.copy.dragComponentHere}</div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex min-h-20 w-full items-center justify-center rounded-md border border-dashed bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
          {editor.copy.emptySlot}
        </div>
      ) : (
        <div
          className="grid gap-6 lg:grid-cols-6"
          onDragOver={(event) => {
            if (!hasComponentDragData(event) || (event.target as HTMLElement).closest("[data-page-component-item]")) {
              return
            }
            const source = dragSourceForEvent(event)
            if (!source || !isAllowedDropSource(source, pageKey)) {
              return
            }
            event.preventDefault()
            event.dataTransfer.dropEffect = "move"
            setDropTarget(dropTargetFromGridPointer(event, items, source, editor, pageKey, slotKey))
          }}
        >
          {items.map((item, index) => (
            <Fragment key={item.id}>
              {dropTarget?.index === index && (
                <InsertionDropZone
                  dropTarget={dropTarget}
                  editor={editor}
                  pageKey={pageKey}
                  slotKey={slotKey}
                  index={index}
                  onDropComplete={() => setDropTarget(null)}
                />
              )}
              <div
                key={item.id}
                data-component-index={index}
                data-page-component-item
                draggable
                className={cn("min-w-0 cursor-grab active:cursor-grabbing", widthClasses[item.width || "half"])}
                onDragStart={(event) => {
                  if ((event.target as HTMLElement).closest("[data-no-drag]")) {
                    event.preventDefault()
                    return
                  }
                  const dragData = { action: "move" as const, pageKey, slotKey, index }
                  setActivePageComponentDragData(dragData)
                  event.dataTransfer.effectAllowed = "move"
                  event.dataTransfer.setData(pageComponentDragType, JSON.stringify(dragData))
                }}
                onDragOver={(event) => {
                  if (hasComponentDragData(event)) {
                    const source = dragSourceForEvent(event)
                    if (!source || !isAllowedDropSource(source, pageKey)) {
                      return
                    }
                    event.preventDefault()
                    event.dataTransfer.dropEffect = "move"
                    setDropTarget(dropTargetFromPointer(event, index, items, source, editor, pageKey, slotKey))
                  }
                }}
                onDragEnd={() => {
                  setDropTarget(null)
                  clearActivePageComponentDragData()
                }}
                onDrop={(event) => {
                  const source = dragSourceForEvent(event)
                  if (!source || (source.action === "move" && source.pageKey !== pageKey)) {
                    return
                  }
                  event.preventDefault()
                  event.stopPropagation()
                  const target = dropTarget || dropTargetFromPointer(event, index, items, source, editor, pageKey, slotKey)
                  placeDraggedComponent(editor, pageKey, slotKey, target.index, source)
                  setDropTarget(null)
                  clearActivePageComponentDragData()
                }}
              >
                <div className="rounded-md border bg-background p-2 shadow-sm">
                  <div className="mb-2 flex flex-col gap-2 rounded-md bg-muted/70 px-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-xs font-medium">
                      <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded bg-background">{index + 1}</span>
                      <span>{pageComponentLabel(item.type, editor.language)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={String((item.width || "half") || "__shadcn_empty__")} onValueChange={(value) => editor.updateComponentWidth(pageKey, slotKey, item.id, (value === "__shadcn_empty__" ? "" : value) as PageComponentWidth)}><SelectTrigger className={selectClass} aria-label={editor.copy.width}><SelectValue /></SelectTrigger><SelectContent>
                        <SelectItem value="full">{editor.copy.widthFull}</SelectItem>
                        <SelectItem value="half">{editor.copy.widthHalf}</SelectItem>
                        <SelectItem value="third">{editor.copy.widthThird}</SelectItem>
                      </SelectContent></Select>
                      <IconButton label={editor.copy.moveUp} disabled={index === 0} onClick={() => editor.moveComponent(pageKey, slotKey, index, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </IconButton>
                      <IconButton label={editor.copy.moveDown} disabled={index === items.length - 1} onClick={() => editor.moveComponent(pageKey, slotKey, index, 1)}>
                        <ArrowDown className="h-4 w-4" />
                      </IconButton>
                      <IconButton label={editor.copy.delete} className="text-red-500 hover:text-red-600" onClick={() => editor.deleteComponent(pageKey, slotKey, item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                  <ComponentConfigEditor
                    editor={editor}
                    item={item}
                    pageKey={pageKey}
                    slotKey={slotKey}
                  />
                  <div className="pointer-events-none">
                    <PageComponent item={item} />
                  </div>
                </div>
              </div>
            </Fragment>
          ))}
          {dropTarget?.index === items.length && (
            <InsertionDropZone
              dropTarget={dropTarget}
              editor={editor}
              pageKey={pageKey}
              slotKey={slotKey}
              index={items.length}
              onDropComplete={() => setDropTarget(null)}
            />
          )}
        </div>
      )}
    </section>
  )
}

function InsertionDropZone({
  dropTarget,
  editor,
  index,
  onDropComplete,
  pageKey,
  slotKey,
}: {
  dropTarget: DropTarget
  editor: NonNullable<ReturnType<typeof usePageLayoutEditor>>
  index: number
  onDropComplete: () => void
  pageKey: string
  slotKey: PageSlotKey
}) {
  return (
    <div
      className={dropTarget.fullRow ? "lg:col-span-6" : widthClasses[dropTarget.width]}
      onDragOver={(event) => {
        if (hasComponentDragData(event)) {
          event.preventDefault()
          event.dataTransfer.dropEffect = "move"
        }
      }}
      onDrop={(event) => {
        const source = dragSourceForEvent(event)
        if (!source || (source.action === "move" && source.pageKey !== pageKey)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        placeDraggedComponent(editor, pageKey, slotKey, index, source)
        onDropComplete()
        clearActivePageComponentDragData()
      }}
    >
      <div className="flex min-h-16 items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/10 px-4 py-4 text-sm font-medium text-primary shadow-sm">
        {editor.copy.dragComponentHere}
      </div>
    </div>
  )
}

function ComponentConfigEditor({
  editor,
  item,
  pageKey,
  slotKey,
}: {
  editor: NonNullable<ReturnType<typeof usePageLayoutEditor>>
  item: PageComponentItem
  pageKey: string
  slotKey: PageSlotKey
}) {
  const fields = componentConfigFields[item.type]
  if (!fields || fields.length === 0) {
    return null
  }

  const config = item.config || {}
  const updateConfig = (patch: PageComponentConfig) => {
    editor.updateComponentConfig(pageKey, slotKey, item.id, { ...config, ...patch })
  }

  return (
    <div data-no-drag className="mb-2 grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
      {fields.map((field) => (
        <ConfigFieldControl
          key={field.key}
          config={config}
          field={field}
          language={editor.language}
          onChange={(value) => updateConfig({ [field.key]: value })}
        />
      ))}
    </div>
  )
}

type ConfigFieldType = "text" | "textarea" | "number" | "select" | "checkbox"

interface ConfigFieldOption {
  value: string
  label: {
    zh: string
    en: string
  }
}

interface ConfigField {
  key: string
  label: {
    zh: string
    en: string
  }
  type: ConfigFieldType
  placeholder?: string
  min?: number
  max?: number
  rows?: number
  span?: "full"
  monospace?: boolean
  options?: ConfigFieldOption[]
}

function ConfigFieldControl({
  config,
  field,
  language,
  onChange,
}: {
  config: PageComponentConfig
  field: ConfigField
  language: string
  onChange: (value: string | boolean) => void
}) {
  const label = language === "zh" ? field.label.zh : field.label.en
  const className = cn("grid gap-1 text-xs font-medium", field.span === "full" && "sm:col-span-2")

  if (field.type === "textarea") {
    return (
      <label className={className}>
        <span>{label}</span>
        <textarea
          className={cn(configInputClass, "min-h-24 py-2", field.monospace && "font-mono")}
          rows={field.rows}
          value={stringConfig(config, field.key)}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    )
  }

  if (field.type === "select") {
    return (
      <label className={className}>
        <span>{label}</span>
        <Select value={String((stringConfig(config, field.key)) || "__shadcn_empty__")} onValueChange={(value) => onChange((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className={cn(configInputClass, "h-9")}><SelectValue /></SelectTrigger><SelectContent>
          {(field.options || []).map((option) => (
            <SelectItem key={option.value} value={String(option.value)}>
              {language === "zh" ? option.label.zh : option.label.en}
            </SelectItem>
          ))}
        </SelectContent></Select>
      </label>
    )
  }

  if (field.type === "checkbox") {
    return (
      <label className={cn(className, "flex-row items-center gap-2 rounded-md border bg-background px-3 py-2")}>
        <input
          type="checkbox"
          checked={booleanConfig(config, field.key)}
          onChange={(event) => onChange(event.target.checked ? "true" : "false")}
        />
        <span>{label}</span>
      </label>
    )
  }

  return (
    <label className={className}>
      <span>{label}</span>
      <input
        className={cn(configInputClass, "h-9")}
        type={field.type === "number" ? "number" : "text"}
        min={field.min}
        max={field.max}
        value={stringConfig(config, field.key)}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function IconButton({
  children,
  className,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode
  className?: string
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Button type="button" variant="outline" size="icon" className={cn("h-8 w-8", className)} disabled={disabled} title={label} aria-label={label} onClick={onClick}>
      {children}
    </Button>
  )
}

const configInputClass =
  "w-full rounded-2xl border border-input bg-background px-3 text-sm font-normal ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

const toneFieldOptions: ConfigFieldOption[] = [
  { value: "neutral", label: { zh: "默认", en: "Neutral" } },
  { value: "accent", label: { zh: "强调", en: "Accent" } },
  { value: "success", label: { zh: "成功", en: "Success" } },
  { value: "warning", label: { zh: "警告", en: "Warning" } },
  { value: "danger", label: { zh: "危险", en: "Danger" } },
]

const alignFieldOptions: ConfigFieldOption[] = [
  { value: "left", label: { zh: "左对齐", en: "Left" } },
  { value: "center", label: { zh: "居中", en: "Center" } },
]

const objectFitFieldOptions: ConfigFieldOption[] = [
  { value: "cover", label: { zh: "裁切铺满", en: "Cover" } },
  { value: "contain", label: { zh: "完整显示", en: "Contain" } },
]

const componentConfigFields: Record<string, ConfigField[]> = {
  custom_html: [
    textField("title", "标题", "Title"),
    numberField("height", "高度", "Height", 80, 1200),
    textareaField("html", "HTML", "HTML", 8, "full", true),
  ],
  iframe: [
    textField("title", "标题", "Title"),
    textField("iframe_url", "iframe 地址", "Iframe URL", "https://example.com", "full"),
    numberField("iframe_height", "高度", "Height", 80, 1200),
  ],
  title_bar: [
    textField("eyebrow", "标签", "Eyebrow"),
    selectField("align", "对齐", "Align", alignFieldOptions),
    textField("title", "标题", "Title", undefined, "full"),
    textareaField("subtitle", "说明", "Subtitle", 3, "full"),
    selectField("tone", "色调", "Tone", toneFieldOptions),
  ],
  image_box: [
    textField("title", "标题", "Title"),
    textField("image_url", "图片地址", "Image URL", "https://example.com/image.jpg", "full"),
    textareaField("caption", "说明", "Caption", 3, "full"),
    textField("link_url", "点击链接", "Link URL", "https://example.com", "full"),
    numberField("image_height", "图片高度", "Image height", 80, 1200),
    selectField("object_fit", "图片显示", "Object fit", objectFitFieldOptions),
  ],
  image_marquee: [
    textField("title", "标题", "Title"),
    textareaField("image_urls", "图片地址列表", "Image URLs", 6, "full"),
    textareaField("caption", "说明", "Caption", 3, "full"),
    numberField("marquee_height", "高度", "Height", 80, 1200),
    numberField("marquee_speed", "速度秒数", "Speed seconds", 8, 120),
  ],
  text_box: [
    textField("title", "标题", "Title"),
    textareaField("body", "正文", "Body", 6, "full"),
    selectField("tone", "色调", "Tone", toneFieldOptions),
  ],
  clock: [
    textField("title", "标题", "Title"),
    textField("timezone", "时区", "Timezone", "Asia/Shanghai"),
    textField("timezone_label", "时区显示名", "Timezone label"),
    checkboxField("show_date", "显示日期", "Show date"),
  ],
  music_player: [
    textField("title", "标题", "Title"),
    textField("artist", "作者", "Artist"),
    textField("audio_url", "音频地址", "Audio URL", "https://example.com/audio.mp3", "full"),
    textField("cover_url", "封面地址", "Cover URL", "https://example.com/cover.jpg", "full"),
  ],
  callout_banner: [
    textField("title", "标题", "Title"),
    selectField("tone", "色调", "Tone", toneFieldOptions),
    textareaField("body", "正文", "Body", 4, "full"),
    textField("button_label", "按钮文字", "Button label"),
    textField("button_url", "按钮链接", "Button URL", "https://example.com"),
  ],
  metric_tile: [
    textField("title", "标题", "Title"),
    selectField("tone", "色调", "Tone", toneFieldOptions),
    textField("value", "数值", "Value"),
    textareaField("helper", "说明", "Helper text", 3, "full"),
  ],
}

function textField(key: string, zh: string, en: string, placeholder?: string, span?: "full"): ConfigField {
  return { key, label: { zh, en }, type: "text", placeholder, span }
}

function textareaField(key: string, zh: string, en: string, rows: number, span?: "full", monospace?: boolean): ConfigField {
  return { key, label: { zh, en }, type: "textarea", rows, span, monospace }
}

function numberField(key: string, zh: string, en: string, min: number, max: number): ConfigField {
  return { key, label: { zh, en }, type: "number", min, max }
}

function selectField(key: string, zh: string, en: string, options: ConfigFieldOption[]): ConfigField {
  return { key, label: { zh, en }, type: "select", options }
}

function checkboxField(key: string, zh: string, en: string): ConfigField {
  return { key, label: { zh, en }, type: "checkbox" }
}

function stringConfig(config: PageComponentConfig, key: string) {
  const value = config[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
}

function booleanConfig(config: PageComponentConfig, key: string) {
  const value = config[key]
  if (typeof value === "boolean") {
    return value
  }
  return value === "true"
}

function slotLabel(pageKey: string, slotKey: PageSlotKey, copy: NonNullable<ReturnType<typeof usePageLayoutEditor>>["copy"]) {
  if (pageKeyFromPathname(pageKey) === DASHBOARD_PAGE_KEY && slotKey === "main") {
    return copy.positionMain
  }
  if (slotKey === "before") {
    return copy.positionBefore
  }
  if (slotKey === "after") {
    return copy.positionAfter
  }
  if (slotKey === "primary") {
    return copy.positionPrimary
  }
  if (slotKey === "secondary") {
    return copy.positionSecondary
  }
  return copy.positionMain
}

function hasComponentDragData(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes(pageComponentDragType)
}

function dragSourceForEvent(event: DragEvent): PageComponentDragData | null {
  return readComponentDragData(event) || getActivePageComponentDragData()
}

interface LayoutRow {
  indices: number[]
  width: number
}

function dropTargetFromPointer(
  event: DragEvent<HTMLElement>,
  index: number,
  items: PageComponentItem[],
  source: PageComponentDragData,
  editor: NonNullable<ReturnType<typeof usePageLayoutEditor>>,
  pageKey: string,
  slotKey: PageSlotKey
): DropTarget {
  const width = widthForDragSource(source, editor)
  const row = rowForIndex(layoutRows(items), index)
  const canInline = width !== "full" && row ? rowCanFitDrop(row, items, source, pageKey, slotKey, width) : false
  const rect = event.currentTarget.getBoundingClientRect()
  const leftEdge = rect.left + rect.width * 0.35
  const rightEdge = rect.right - rect.width * 0.35

  if (canInline && event.clientX <= leftEdge) {
    return { index, width, fullRow: false }
  }
  if (canInline && event.clientX >= rightEdge) {
    return { index: index + 1, width, fullRow: false }
  }

  const midpoint = rect.top + rect.height / 2
  return { index: event.clientY > midpoint ? index + 1 : index, width, fullRow: true }
}

function dropTargetFromGridPointer(
  event: DragEvent<HTMLDivElement>,
  items: PageComponentItem[],
  source: PageComponentDragData,
  editor: NonNullable<ReturnType<typeof usePageLayoutEditor>>,
  pageKey: string,
  slotKey: PageSlotKey
): DropTarget {
  const width = widthForDragSource(source, editor)
  const rows = layoutRows(items)
  const row = rowFromGridPointer(event, rows)
  if (!row) {
    return dropTargetForEnd(items, source, editor, pageKey, slotKey)
  }

  const canInline = width !== "full" && rowCanFitDrop(row, items, source, pageKey, slotKey, width)
  const firstIndex = row.indices[0]
  const lastIndex = row.indices[row.indices.length - 1]
  if (canInline) {
    const firstElement = event.currentTarget.querySelector<HTMLElement>(`[data-component-index="${firstIndex}"]`)
    const lastElement = event.currentTarget.querySelector<HTMLElement>(`[data-component-index="${lastIndex}"]`)
    if (firstElement && event.clientX < firstElement.getBoundingClientRect().left) {
      return { index: firstIndex, width, fullRow: false }
    }
    if (lastElement && event.clientX > lastElement.getBoundingClientRect().right) {
      return { index: lastIndex + 1, width, fullRow: false }
    }
  }

  return { index: lastIndex + 1, width, fullRow: true }
}

function dropTargetForEnd(
  items: PageComponentItem[],
  source: PageComponentDragData,
  editor: NonNullable<ReturnType<typeof usePageLayoutEditor>>,
  pageKey: string,
  slotKey: PageSlotKey
): DropTarget {
  const width = widthForDragSource(source, editor)
  const rows = layoutRows(items)
  const lastRow = rows[rows.length - 1]
  const canInline = Boolean(lastRow && width !== "full" && rowCanFitDrop(lastRow, items, source, pageKey, slotKey, width))
  return { index: items.length, width, fullRow: !canInline }
}

function rowFromGridPointer(event: DragEvent<HTMLDivElement>, rows: LayoutRow[]) {
  return rows.find((row) => {
    const elements = row.indices
      .map((index) => event.currentTarget.querySelector<HTMLElement>(`[data-component-index="${index}"]`))
      .filter((element): element is HTMLElement => Boolean(element))
    if (elements.length === 0) {
      return false
    }
    const top = Math.min(...elements.map((element) => element.getBoundingClientRect().top))
    const bottom = Math.max(...elements.map((element) => element.getBoundingClientRect().bottom))
    return event.clientY >= top && event.clientY <= bottom
  })
}

function rowForIndex(rows: LayoutRow[], index: number) {
  return rows.find((row) => row.indices.includes(index))
}

function layoutRows(items: PageComponentItem[]): LayoutRow[] {
  const rows: LayoutRow[] = []
  let current: LayoutRow = { indices: [], width: 0 }
  items.forEach((item, index) => {
    const width = widthColumns[item.width || "half"]
    if (current.indices.length > 0 && current.width + width > 6) {
      rows.push(current)
      current = { indices: [], width: 0 }
    }
    current.indices.push(index)
    current.width += width
    if (current.width >= 6) {
      rows.push(current)
      current = { indices: [], width: 0 }
    }
  })
  if (current.indices.length > 0) {
    rows.push(current)
  }
  return rows
}

function rowCanFitDrop(
  row: LayoutRow,
  items: PageComponentItem[],
  source: PageComponentDragData,
  pageKey: string,
  slotKey: PageSlotKey,
  width: PageComponentWidth
) {
  let occupied = row.width
  if (source.action === "move" && source.pageKey === pageKey && source.slotKey === slotKey && row.indices.includes(source.index)) {
    occupied -= widthColumns[items[source.index]?.width || "half"]
  }
  return occupied + widthColumns[width] <= 6
}

function widthForDragSource(source: PageComponentDragData, editor: NonNullable<ReturnType<typeof usePageLayoutEditor>>): PageComponentWidth {
  if (source.action === "create") {
    return defaultWidthForPageComponent(source.type)
  }
  return editor.getItems(source.pageKey, source.slotKey)[source.index]?.width || "half"
}

function isAllowedDropSource(source: PageComponentDragData, pageKey: string) {
  return source.action === "create" || source.pageKey === pageKey
}

function placeDraggedComponent(
  editor: NonNullable<ReturnType<typeof usePageLayoutEditor>>,
  pageKey: string,
  slotKey: PageSlotKey,
  index: number,
  source: PageComponentDragData
) {
  if (source.action === "create") {
    editor.addComponent(pageKey, slotKey, source.type, index)
    return
  }
  editor.moveComponentTo(pageKey, source.slotKey, source.index, slotKey, index)
}

function readComponentDragData(event: DragEvent): PageComponentDragData | null {
  const raw = event.dataTransfer.getData(pageComponentDragType)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const action = typeof parsed.action === "string" ? parsed.action : "move"
    if (action === "create" && typeof parsed.type === "string" && parsed.type) {
      return {
        action: "create",
        type: parsed.type,
      }
    }
    if (action !== "move") {
      return null
    }
    if (typeof parsed.pageKey !== "string" || !isPageSlotKey(parsed.slotKey) || typeof parsed.index !== "number") {
      return null
    }
    return {
      action: "move",
      pageKey: pageKeyFromPathname(parsed.pageKey),
      slotKey: parsed.slotKey,
      index: parsed.index,
    }
  } catch {
    return null
  }
}

function isPageSlotKey(value: unknown): value is PageSlotKey {
  return value === "before" || value === "main" || value === "primary" || value === "secondary" || value === "after"
}
