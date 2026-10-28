import { useState } from "react"
import { ArrowDown, ArrowUp, CalendarDays, Clock3, Plus, Trash } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useI18n } from "@/lib/i18n"

export interface PricingCondition {
  type: "group" | "condition"
  logic?: "and" | "or"
  conditions?: PricingCondition[]
  field?: string
  operator?: string
  value?: number
  start?: string
  end?: string
  weekdays?: number[]
}

export interface TimePriceTier {
  start?: string
  end?: string
  price: string | number
  label?: string
  conditions?: PricingCondition
}

export interface TimePricing {
  timezone: string
  input: TimePriceTier[]
  output: TimePriceTier[]
  cached_input: TimePriceTier[]
  cache_write_input: TimePriceTier[]
  cache_write_1h_input: TimePriceTier[]
  image_input: TimePriceTier[]
  image_output: TimePriceTier[]
  audio_input: TimePriceTier[]
  audio_output: TimePriceTier[]
}

type TimePricingField = keyof Omit<TimePricing, "timezone">

type RuleCopy = {
  title: string
  description: string
  perCallDescription: string
  timezone: string
  meter: string
  priorityNote: string
  addOffPeak: string
  addPeak: string
  addRule: string
  empty: string
  rule: string
  price: string
  pricePerCall: string
  pricePlaceholder: string
  allDays: string
  conditionGroup: string
  match: string
  all: string
  any: string
  addCondition: string
  addGroup: string
  removeCondition: string
  timeRange: string
  currentTokens: string
  fullInputTokens: string
  fullRequestTokens: string
  billableInputTokens: string
  billableOutputTokens: string
  start: string
  end: string
  weekdays: string
  overnightHint: string
  value: string
  save: string
  cancel: string
  editRules: string
  noRules: string
  rulesCount: (count: number) => string
  allMeterTypes: string
  days: string[]
  operators: Array<{ value: string; label: string }>
  unnamed: string
  invalidRule: string
  priority: string
}

const zh: RuleCopy = {
  title: "闲忙时计价规则",
  description: "为当前计费项设置按时间与用量条件触发的价格。命中第一条规则后，继续应用该计费项已有的 token 分段价格。",
  perCallDescription: "为当前计费项设置按时间与用量条件触发的价格；命中第一条规则后，用该规则价格替代基础按次价格。",
  timezone: "时区",
  meter: "计费项",
  priorityNote: "规则按顺序从上到下判断；多条同时满足时，优先采用排在前面的规则。",
  addOffPeak: "添加闲时规则",
  addPeak: "添加忙时规则",
  addRule: "添加空白规则",
  empty: "还没有时间规则。添加闲时或忙时规则，未命中任何规则时使用基础价格。",
  rule: "规则名称",
  price: "命中后的价格 / 1M",
  pricePerCall: "命中后的每次价格",
  pricePlaceholder: "例如 0.8",
  allDays: "未选星期表示每天",
  conditionGroup: "条件组",
  match: "满足",
  all: "全部（AND）",
  any: "任一（OR）",
  addCondition: "添加条件",
  addGroup: "添加条件组",
  removeCondition: "删除条件",
  timeRange: "时间段",
  currentTokens: "当前计价项 token",
  fullInputTokens: "完整输入 token",
  fullRequestTokens: "完整请求 token",
  billableInputTokens: "计价输入 token",
  billableOutputTokens: "计价输出 token",
  start: "开始",
  end: "结束",
  weekdays: "星期",
  overnightHint: "跨午夜时，星期按时段开始的那一天判定。",
  value: "阈值",
  save: "应用规则",
  cancel: "取消",
  editRules: "编辑时间规则",
  noRules: "未配置",
  rulesCount: (count) => `${count} 条规则`,
  allMeterTypes: "输入、输出、缓存和多模态均可分别配置",
  days: ["日", "一", "二", "三", "四", "五", "六"],
  operators: [
    { value: ">=", label: "大于等于" },
    { value: ">", label: "大于" },
    { value: "<=", label: "小于等于" },
    { value: "<", label: "小于" },
    { value: "==", label: "等于" },
    { value: "!=", label: "不等于" },
  ],
  unnamed: "未命名规则",
  invalidRule: "请补齐条件和有效价格后再应用。",
  priority: "优先级",
}

const en: RuleCopy = {
  title: "Peak / off-peak pricing rules",
  description: "Set prices for this metering item using time and usage conditions. The first matching rule wins, then existing token tiers are applied.",
  perCallDescription: "Set prices for this metering item using time and usage conditions. The first matching rule replaces the base per-call price.",
  timezone: "Timezone",
  meter: "Metering item",
  priorityNote: "Rules are evaluated from top to bottom. If multiple rules match, the first one takes priority.",
  addOffPeak: "Add off-peak rule",
  addPeak: "Add peak rule",
  addRule: "Add blank rule",
  empty: "No time rules yet. Add a peak or off-peak rule. The base price applies when no rule matches.",
  rule: "Rule name",
  price: "Price when matched / 1M",
  pricePerCall: "Price per call when matched",
  pricePlaceholder: "e.g. 0.8",
  allDays: "No day selected means every day",
  conditionGroup: "Condition group",
  match: "Match",
  all: "All (AND)",
  any: "Any (OR)",
  addCondition: "Add condition",
  addGroup: "Add group",
  removeCondition: "Remove condition",
  timeRange: "Time range",
  currentTokens: "Current metering-item tokens",
  fullInputTokens: "Full input tokens",
  fullRequestTokens: "Full request tokens",
  billableInputTokens: "Billable input tokens",
  billableOutputTokens: "Billable output tokens",
  start: "Start",
  end: "End",
  weekdays: "Weekdays",
  overnightHint: "For overnight ranges, the selected weekday applies to the day the range starts.",
  value: "Threshold",
  save: "Apply rules",
  cancel: "Cancel",
  editRules: "Edit time rules",
  noRules: "Not configured",
  rulesCount: (count) => `${count} rule${count === 1 ? "" : "s"}`,
  allMeterTypes: "Input, output, cache, and multimodal items can be configured separately",
  days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  operators: [
    { value: ">=", label: "At least" },
    { value: ">", label: "Greater than" },
    { value: "<=", label: "At most" },
    { value: "<", label: "Less than" },
    { value: "==", label: "Equal to" },
    { value: "!=", label: "Not equal to" },
  ],
  unnamed: "Untitled rule",
  invalidRule: "Complete each condition and enter a valid price before applying.",
  priority: "Priority",
}

const fieldDefinitions: Array<{ key: TimePricingField; zh: string; en: string }> = [
  { key: "input", zh: "输入", en: "Input" },
  { key: "output", zh: "输出", en: "Output" },
  { key: "cached_input", zh: "缓存读取", en: "Cache read" },
  { key: "cache_write_input", zh: "缓存写入", en: "Cache write" },
  { key: "cache_write_1h_input", zh: "1 小时缓存写入", en: "1-hour cache write" },
  { key: "image_input", zh: "图像输入", en: "Image input" },
  { key: "image_output", zh: "图像输出", en: "Image output" },
  { key: "audio_input", zh: "音频输入", en: "Audio input" },
  { key: "audio_output", zh: "音频输出", en: "Audio output" },
]

const weekdays = [0, 1, 2, 3, 4, 5, 6]
const emptyPricing = (): TimePricing => ({
  timezone: "UTC",
  input: [],
  output: [],
  cached_input: [],
  cache_write_input: [],
  cache_write_1h_input: [],
  image_input: [],
  image_output: [],
  audio_input: [],
  audio_output: [],
})

function defaultTimeCondition(start = "00:00", end = "08:00"): PricingCondition {
  return { type: "condition", field: "time_range", start, end, weekdays: [] }
}

function defaultConditionGroup(start = "00:00", end = "08:00"): PricingCondition {
  return { type: "group", logic: "and", conditions: [defaultTimeCondition(start, end)] }
}

function normalizePricing(pricing?: TimePricing): TimePricing {
  return { ...emptyPricing(), ...(pricing || {}) }
}

function asEditableTier(tier: TimePriceTier): TimePriceTier {
  return {
    ...tier,
    start: "",
    end: "",
    conditions: tier.conditions || defaultConditionGroup(tier.start || "00:00", tier.end || "08:00"),
  }
}

function metricLabel(field: string, copy: RuleCopy) {
  switch (field) {
    case "current_tokens": return copy.currentTokens
    case "full_input_tokens": return copy.fullInputTokens
    case "full_request_tokens": return copy.fullRequestTokens
    case "billable_input_tokens": return copy.billableInputTokens
    case "billable_output_tokens": return copy.billableOutputTokens
    default: return copy.timeRange
  }
}

function summarizeCondition(condition: PricingCondition | undefined, copy: RuleCopy): string {
  if (!condition) return copy.noRules
  if (condition.type === "group") {
    const items = (condition.conditions || []).map((item) => summarizeCondition(item, copy))
    const separator = condition.logic === "or" ? (copy === zh ? " 或 " : " OR ") : (copy === zh ? " 且 " : " AND ")
    return items.length ? `(${items.join(separator)})` : copy.noRules
  }
  if (condition.field === "time_range") {
    const days = condition.weekdays?.length ? condition.weekdays.map((day) => copy.days[day]).join("/") : (copy === zh ? "每天" : "Every day")
    return `${days} ${condition.start || "00:00"}–${condition.end || "00:00"}`
  }
  return `${metricLabel(condition.field || "", copy)} ${condition.operator || ">="} ${condition.value ?? 0}`
}

function conditionIsValid(condition: PricingCondition): boolean {
  if (condition.type === "group") {
    return (condition.logic === "and" || condition.logic === "or") && Boolean(condition.conditions?.length) && condition.conditions!.every(conditionIsValid)
  }
  if (condition.type !== "condition") return false
  if (condition.field === "time_range") {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(condition.start || "") && /^([01]\d|2[0-3]):[0-5]\d$/.test(condition.end || "") && (condition.weekdays || []).every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  }
  return ["current_tokens", "full_input_tokens", "full_request_tokens", "billable_input_tokens", "billable_output_tokens"].includes(condition.field || "") && [">", ">=", "<", "<=", "==", "!="].includes(condition.operator || "") && Number.isInteger(condition.value) && (condition.value || 0) >= 0
}

function freshCondition(field = "time_range"): PricingCondition {
  if (field === "time_range") return defaultTimeCondition("09:00", "18:00")
  return { type: "condition", field, operator: ">=", value: 1_000_000 }
}

export function TimePricingEditor({ pricing, onChange, quotaType = 0 }: { pricing?: TimePricing; onChange: (pricing: TimePricing) => void; quotaType?: number }) {
  const { language } = useI18n()
  const copy = language === "zh" ? zh : en
  const description = quotaType === 1 ? copy.perCallDescription : copy.description
  const priceLabel = quotaType === 1 ? copy.pricePerCall : copy.price
  const normalized = normalizePricing(pricing)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<TimePricing>(normalized)
  const [field, setField] = useState<TimePricingField>("input")
  const ruleCount = fieldDefinitions.reduce((count, item) => count + (normalized[item.key]?.length || 0), 0)
  const currentRules = draft[field] || []
  const canApply = currentRules.every((rule) => String(rule.price ?? "").trim() !== "" && Number.isFinite(Number(rule.price)) && Number(rule.price) >= 0 && conditionIsValid(rule.conditions || defaultConditionGroup(rule.start, rule.end)))

  const openEditor = () => {
    setDraft(normalizePricing(pricing))
    setOpen(true)
  }

  const updateCurrentRules = (next: TimePriceTier[]) => setDraft((previous) => ({ ...previous, [field]: next }))

  const updateRule = (index: number, patch: Partial<TimePriceTier>) => {
    updateCurrentRules(currentRules.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      return { ...asEditableTier(item), ...patch }
    }))
  }

  const addRule = (label: string, start: string, end: string) => {
    updateCurrentRules([...currentRules, {
      label,
      start: "",
      end: "",
      price: 0,
      conditions: defaultConditionGroup(start, end),
    }])
  }

  const moveRule = (index: number, offset: number) => {
    const target = index + offset
    if (target < 0 || target >= currentRules.length) return
    const next = [...currentRules]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    updateCurrentRules(next)
  }

  const applyChanges = () => {
    onChange(draft)
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4 text-primary" />{copy.title}</div>
        <div className="text-xs text-muted-foreground">{ruleCount ? copy.rulesCount(ruleCount) : copy.noRules} · {normalized.timezone} · {copy.allMeterTypes}</div>
      </div>
      <Button type="button" variant="outline" onClick={openEditor}>{copy.editRules}</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4 pr-14 sm:px-6">
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="space-y-4 overflow-y-auto border-b bg-muted/20 p-4 md:border-r md:border-b-0">
              <label className="block space-y-2 text-sm">
                <span className="font-medium">{copy.timezone}</span>
                <Input value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} placeholder="Asia/Shanghai" />
              </label>
              <div className="space-y-2">
                <div className="text-sm font-medium">{copy.meter}</div>
                <div className="space-y-1">
                  {fieldDefinitions.map((item) => {
                    const active = field === item.key
                    const count = draft[item.key]?.length || 0
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setField(item.key)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"}`}
                      >
                        <span>{language === "zh" ? item.zh : item.en}</span>
                        {count > 0 && <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-primary-foreground/20" : "bg-muted"}`}>{count}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            </aside>

            <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-base font-semibold">{fieldDefinitions.find((item) => item.key === field)?.[language === "zh" ? "zh" : "en"]}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{copy.priorityNote}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => addRule(language === "zh" ? "闲时价" : "Off-peak", "00:00", "08:00")}><Plus className="mr-1 size-4" />{copy.addOffPeak}</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => addRule(language === "zh" ? "忙时价" : "Peak", "08:00", "20:00")}><Plus className="mr-1 size-4" />{copy.addPeak}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => addRule(language === "zh" ? `规则 ${currentRules.length + 1}` : `Rule ${currentRules.length + 1}`, "09:00", "18:00")}><Plus className="mr-1 size-4" />{copy.addRule}</Button>
                </div>
              </div>

              {currentRules.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{copy.empty}</div>
              ) : (
                <div className="space-y-3">
                  {currentRules.map((rule, index) => {
                    const editable = asEditableTier(rule)
                    return (
                      <section key={`${field}-${index}`} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground lg:pt-2">
                            <span className="mr-1 whitespace-nowrap">{copy.priority} {index + 1}</span>
                            <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} aria-label={copy.priority} onClick={() => moveRule(index, -1)}><ArrowUp className="size-4" /></Button>
                            <Button type="button" variant="ghost" size="icon-sm" disabled={index === currentRules.length - 1} aria-label={copy.priority} onClick={() => moveRule(index, 1)}><ArrowDown className="size-4" /></Button>
                          </div>
                          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                            <label className="block space-y-1.5 text-sm">
                              <span className="font-medium">{copy.rule}</span>
                              <Input value={rule.label || ""} onChange={(event) => updateRule(index, { label: event.target.value })} placeholder={copy.unnamed} />
                            </label>
                            <label className="block space-y-1.5 text-sm">
                              <span className="font-medium">{priceLabel}</span>
                              <Input type="number" min="0" step="0.000001" value={String(rule.price ?? 0)} onChange={(event) => updateRule(index, { price: event.target.value })} placeholder={copy.pricePlaceholder} />
                            </label>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="self-end text-muted-foreground hover:text-destructive lg:self-start" aria-label={copy.removeCondition} onClick={() => updateCurrentRules(currentRules.filter((_, itemIndex) => itemIndex !== index))}><Trash className="size-4" /></Button>
                        </div>
                        <div className="space-y-2 border-t pt-3">
                          <div className="flex items-center gap-2 text-sm font-medium"><CalendarDays className="size-4 text-muted-foreground" />{copy.conditionGroup}</div>
                          <ConditionEditor
                            condition={editable.conditions || defaultConditionGroup()}
                            copy={copy}
                            onChange={(conditions) => updateRule(index, { conditions, start: "", end: "" })}
                          />
                          <div className="truncate rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground" title={summarizeCondition(editable.conditions, copy)}>
                            {summarizeCondition(editable.conditions, copy)}
                          </div>
                        </div>
                      </section>
                    )
                  })}
                </div>
              )}

              {!canApply && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{copy.invalidRule}</div>}
            </div>
          </div>

          <DialogFooter className="border-t bg-background px-5 py-3 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{copy.cancel}</Button>
            <Button type="button" disabled={!canApply} onClick={applyChanges}>{copy.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ConditionEditor({
  condition,
  copy,
  onChange,
  onRemove,
  depth = 0,
}: {
  condition: PricingCondition
  copy: RuleCopy
  onChange: (condition: PricingCondition) => void
  onRemove?: () => void
  depth?: number
}) {
  if (condition.type === "group") {
    const children = condition.conditions || []
    return (
      <div className={`space-y-3 rounded-xl border p-3 ${depth === 0 ? "border-primary/20 bg-primary/[0.025]" : "bg-muted/20"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span>{copy.match}</span>
            <Select value={condition.logic || "and"} onValueChange={(logic) => onChange({ ...condition, logic: logic as "and" | "or" })}>
              <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="and">{copy.all}</SelectItem>
                <SelectItem value="or">{copy.any}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {onRemove && <Button type="button" variant="ghost" size="icon-sm" aria-label={copy.removeCondition} onClick={onRemove}><Trash className="size-4" /></Button>}
        </div>

        <div className="space-y-2 border-l-2 border-border pl-3 sm:pl-4">
          {children.map((child, index) => (
            <div key={index} className="space-y-2">
              {index > 0 && <div className="-ml-3 w-fit rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground sm:-ml-4">{condition.logic === "or" ? "OR" : "AND"}</div>}
              <ConditionEditor
                condition={child}
                copy={copy}
                depth={depth + 1}
                onRemove={() => onChange({ ...condition, conditions: children.filter((_, childIndex) => childIndex !== index) })}
                onChange={(next) => onChange({ ...condition, conditions: children.map((item, childIndex) => childIndex === index ? next : item) })}
              />
            </div>
          ))}
          {children.length === 0 && <div className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">{copy.invalidRule}</div>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...condition, conditions: [...children, freshCondition()] })}><Plus className="mr-1 size-3.5" />{copy.addCondition}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...condition, conditions: [...children, { type: "group", logic: "and", conditions: [freshCondition()] }] })}><Plus className="mr-1 size-3.5" />{copy.addGroup}</Button>
        </div>
      </div>
    )
  }

  const field = condition.field || "time_range"
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(165px,0.9fr)_minmax(0,2fr)_auto] lg:items-start">
        <Select value={field} onValueChange={(nextField) => onChange(freshCondition(nextField))}>
          <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="time_range">{copy.timeRange}</SelectItem>
            <SelectItem value="current_tokens">{copy.currentTokens}</SelectItem>
            <SelectItem value="full_input_tokens">{copy.fullInputTokens}</SelectItem>
            <SelectItem value="full_request_tokens">{copy.fullRequestTokens}</SelectItem>
            <SelectItem value="billable_input_tokens">{copy.billableInputTokens}</SelectItem>
            <SelectItem value="billable_output_tokens">{copy.billableOutputTokens}</SelectItem>
          </SelectContent>
        </Select>

        {field === "time_range" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs text-muted-foreground"><span>{copy.start}</span><Input type="time" value={condition.start || "00:00"} onChange={(event) => onChange({ ...condition, start: event.target.value })} /></label>
              <label className="space-y-1 text-xs text-muted-foreground"><span>{copy.end}</span><Input type="time" value={condition.end || "08:00"} onChange={(event) => onChange({ ...condition, end: event.target.value })} /></label>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{copy.weekdays}</span>{!(condition.weekdays || []).length && <span>{copy.allDays}</span>}</div>
              <div className="flex flex-wrap gap-1.5">
                {weekdays.map((day) => {
                  const selected = (condition.weekdays || []).includes(day)
                  return <Button key={day} type="button" size="sm" variant={selected ? "default" : "outline"} className="h-7 min-w-9 px-2 text-xs" aria-pressed={selected} onClick={() => {
                    const nextDays = selected ? (condition.weekdays || []).filter((item) => item !== day) : [...(condition.weekdays || []), day].sort((a, b) => a - b)
                    onChange({ ...condition, weekdays: nextDays })
                  }}>{copy.days[day]}</Button>
                })}
              </div>
              {(condition.start || "00:00") > (condition.end || "08:00") && <div className="text-xs text-muted-foreground">{copy.overnightHint}</div>}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(110px,140px)] gap-2">
            <Select value={condition.operator || ">="} onValueChange={(operator) => onChange({ ...condition, operator })}>
              <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{copy.operators.map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" min="0" step="1" value={String(condition.value ?? 0)} onChange={(event) => onChange({ ...condition, value: Number(event.target.value) })} aria-label={copy.value} />
          </div>
        )}

        {onRemove && <Button type="button" variant="ghost" size="icon" className="justify-self-end text-muted-foreground hover:text-destructive" aria-label={copy.removeCondition} onClick={onRemove}><Trash className="size-4" /></Button>}
      </div>
    </div>
  )
}
