import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Boxes, Search, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PublicTopBar } from "@/components/layout/PublicTopBar"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"
import { formatCurrency, useCurrencyDisplayName } from "@/lib/currency"

interface PriceTier {
  min_tokens: number
  price: string | number
  condition?: string
}

interface PublicModel {
  model_name: string
  description?: string
  provider: string
  provider_name: string
  provider_icon_url: string
  is_meta_model?: boolean
  meta_billing_mode?: string
  input_price: string | number
  output_price: string | number
  cached_input_price: string | number
  cache_write_input_price: string | number
  input_price_tiers: PriceTier[]
  output_price_tiers: PriceTier[]
  cached_input_price_tiers: PriceTier[]
  cache_write_input_price_tiers: PriceTier[]
  user_channels: PublicModelUserChannel[]
  referenced_models?: PublicModel[]
}

interface PublicModelUserChannel {
  id: number
  name: string
  description: string
  multiplier: string | number
  input_price: string | number
  output_price: string | number
  cached_input_price: string | number
  cache_write_input_price: string | number
  effective_input_price: string | number
  effective_output_price: string | number
  effective_cached_input_price: string | number
  effective_cache_write_input_price: string | number
  effective_input_price_tiers: PriceTier[]
  effective_output_price_tiers: PriceTier[]
  effective_cached_input_price_tiers: PriceTier[]
  effective_cache_write_input_price_tiers: PriceTier[]
}

interface ModelView extends PublicModel {
  visible_user_channels: PublicModelUserChannel[]
}

interface SelectOption {
  value: string
  label: string
}

type SortOrder = "name_asc" | "name_desc" | "provider_asc" | "input_asc" | "input_desc" | "output_asc" | "output_desc"

export default function ModelCatalog() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const [searchTerm, setSearchTerm] = useState("")
  const [sortOrder, setSortOrder] = useState<SortOrder>("name_asc")
  const [providerFilter, setProviderFilter] = useState("")
  const [channelFilter, setChannelFilter] = useState("")
  const [selectedModel, setSelectedModel] = useState<ModelView | null>(null)

  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const { data: models = [], isLoading } = useQuery<PublicModel[]>({
    queryKey: ["public-models"],
    queryFn: async () => {
      const res = await api.get("/public/models")
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const providerOptions = useMemo(() => providerFilterOptions(models), [models])
  const channelOptions = useMemo(() => channelFilterOptions(models), [models])
  const filteredModels = useMemo(
    () => filterAndSortModels(models, {
      searchTerm,
      providerFilter,
      channelFilter,
      sortOrder,
    }),
    [models, searchTerm, providerFilter, channelFilter, sortOrder]
  )
  const hasFilters = searchTerm.trim() || providerFilter || channelFilter || sortOrder !== "name_asc"

  const resetFilters = () => {
    setSearchTerm("")
    setSortOrder("name_asc")
    setProviderFilter("")
    setChannelFilter("")
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicTopBar settings={publicSettings} />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{copy.title}</h1>
          </div>
          <Boxes className="h-6 w-6 text-muted-foreground" />
        </div>

        <div className="rounded-md border bg-card p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_180px_180px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={copy.searchPlaceholder}
              />
            </div>
            <Select value={String((sortOrder) || "__shadcn_empty__")} onValueChange={(value) => setSortOrder((value === "__shadcn_empty__" ? "" : value) as SortOrder)}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              {sortOptions(copy).map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
              ))}
            </SelectContent></Select>
            <Select value={String((providerFilter) || "__shadcn_empty__")} onValueChange={(value) => setProviderFilter((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="__shadcn_empty__">{copy.allProviders}</SelectItem>
              {providerOptions.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
              ))}
            </SelectContent></Select>
            <Select value={String((channelFilter) || "__shadcn_empty__")} onValueChange={(value) => setChannelFilter((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="__shadcn_empty__">{copy.allChannels}</SelectItem>
              {channelOptions.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
              ))}
            </SelectContent></Select>
            <Button variant="outline" className="gap-2" disabled={!hasFilters} onClick={resetFilters}>
              <X size={16} />
              {copy.reset}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">{copy.loading}</div>
        ) : models.length === 0 ? (
          <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">{copy.empty}</div>
        ) : filteredModels.length === 0 ? (
          <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">{copy.noResults}</div>
        ) : (
          <div className="grid gap-4">
            {filteredModels.map((item) => (
              <Card
                key={item.model_name}
                className="cursor-pointer transition-colors hover:border-primary/60 hover:bg-muted/20"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedModel(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    setSelectedModel(item)
                  }
                }}
              >
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="break-all font-mono text-lg">{item.model_name}</CardTitle>
                      <div className="flex flex-wrap items-center gap-2">
                        <Provider providerName={item.provider_name} iconURL={item.provider_icon_url} />
                        {showsMetaModelDetails(item) && <MetaModelBadge copy={copy} mode={item.meta_billing_mode} />}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm sm:min-w-[26rem] sm:grid-cols-4">
                      <PriceBox label={copy.inputPrice} value={item.input_price} tiers={item.input_price_tiers} />
                      <PriceBox label={copy.outputPrice} value={item.output_price} tiers={item.output_price_tiers} />
                      <PriceBox label={copy.cachedInputPrice} value={item.cached_input_price} tiers={item.cached_input_price_tiers} />
                      <PriceBox label={copy.cacheWriteInputPrice} value={item.cache_write_input_price} tiers={item.cache_write_input_price_tiers} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-xs text-muted-foreground">{detailCopy(copy).openDetails}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <ModelDetailDialog model={selectedModel} copy={copy} onClose={() => setSelectedModel(null)} />
      {publicSettings.footer_text && (
        <footer className="border-t px-4 py-4 text-center text-sm text-muted-foreground sm:px-6">
          {publicSettings.footer_text}
        </footer>
      )}
    </div>
  )
}

function ModelDetailDialog({
  model,
  copy,
  onClose,
}: {
  model: ModelView | null
  copy: typeof zhCopy
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(model)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto">
        {model && (
          <>
            <DialogHeader>
              <DialogTitle className="break-all font-mono">{model.model_name}</DialogTitle>
              <DialogDescription>{detailCopy(copy).detailSubtitle}</DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <Provider providerName={model.provider_name} iconURL={model.provider_icon_url} />
                {showsMetaModelDetails(model) && <MetaModelBadge copy={copy} mode={model.meta_billing_mode} />}
              </div>
              {model.description && <p className="text-sm text-muted-foreground">{model.description}</p>}

              <section className="space-y-3">
                <div className="text-sm font-medium">{detailCopy(copy).basePricing}</div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <PriceBox label={copy.inputPrice} value={model.input_price} tiers={model.input_price_tiers} showTiers />
                  <PriceBox label={copy.outputPrice} value={model.output_price} tiers={model.output_price_tiers} showTiers />
                  <PriceBox label={copy.cachedInputPrice} value={model.cached_input_price} tiers={model.cached_input_price_tiers} showTiers />
                  <PriceBox label={copy.cacheWriteInputPrice} value={model.cache_write_input_price} tiers={model.cache_write_input_price_tiers} showTiers />
                </div>
              </section>

              {showsMetaModelDetails(model) && (
                <section className="space-y-3">
                  <div>
                    <div className="text-sm font-medium">{copy.referencedModels}</div>
                    <div className="text-xs text-muted-foreground">
                      {model.meta_billing_mode === "meta" ? copy.metaBillingDescription : copy.actualBillingDescription}
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {(model.referenced_models || []).map((item) => (
                      <ReferencedModelPricing key={item.model_name} model={item} copy={copy} />
                    ))}
                  </div>
                </section>
              )}

              <section className="space-y-3">
                <div className="text-sm font-medium">{detailCopy(copy).channelPricing}</div>
                <div className="overflow-x-auto">
                  <div className="min-w-[990px] rounded-md border">
                    <div className="grid grid-cols-[1fr_110px_150px_150px_150px_150px] border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <div>{copy.userChannel}</div>
                      <div>{copy.multiplier}</div>
                      <div>{copy.effectiveInput}</div>
                      <div>{copy.effectiveOutput}</div>
                      <div>{copy.effectiveCachedInput}</div>
                      <div>{copy.effectiveCacheWriteInput}</div>
                    </div>
                    {model.visible_user_channels.map((channel) => (
                      <div key={channel.id} className="grid grid-cols-[1fr_110px_150px_150px_150px_150px] items-center border-b px-3 py-3 text-sm last:border-b-0">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{channel.name}</div>
                          {channel.description && (
                            <div className="truncate text-xs text-muted-foreground">{channel.description}</div>
                          )}
                        </div>
                        <div>{formatMultiplier(channel.multiplier)}</div>
                        <PriceText value={channel.effective_input_price} tiers={channel.effective_input_price_tiers} />
                        <PriceText value={channel.effective_output_price} tiers={channel.effective_output_price_tiers} />
                        <PriceText value={channel.effective_cached_input_price} tiers={channel.effective_cached_input_price_tiers} />
                        <PriceText value={channel.effective_cache_write_input_price} tiers={channel.effective_cache_write_input_price_tiers} />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function detailCopy(copy: typeof zhCopy) {
  if (copy === zhCopy) {
    return {
      openDetails: "点击查看详细信息",
      detailSubtitle: "模型基础计价、分段计价和用户渠道价格",
      basePricing: "基础计价",
      channelPricing: "用户渠道计价",
    }
  }
  return {
    openDetails: "Click to view details",
    detailSubtitle: "Base pricing, tiered pricing, and user channel prices",
    basePricing: "Base pricing",
    channelPricing: "User channel pricing",
  }
}

function Provider({ providerName, iconURL }: { providerName: string; iconURL: string }) {
  return (
    <div className="mt-2 inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs text-muted-foreground">
      {iconURL && <img src={iconURL} alt="" className="h-4 w-4 rounded object-contain" />}
      <span>{providerName || "-"}</span>
    </div>
  )
}

function MetaModelBadge({ copy, mode }: { copy: typeof zhCopy; mode?: string }) {
  return (
    <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-primary">
      <span>{copy.metaModel}</span>
      <span>{mode === "meta" ? copy.billingMeta : copy.billingActual}</span>
    </div>
  )
}

function ReferencedModelPricing({ model, copy }: { model: PublicModel; copy: typeof zhCopy }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="break-all font-mono text-sm font-medium">{model.model_name}</div>
          <Provider providerName={model.provider_name} iconURL={model.provider_icon_url} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:min-w-[26rem] sm:grid-cols-4">
          <PriceBox label={copy.inputPrice} value={model.input_price} tiers={model.input_price_tiers} showTiers />
          <PriceBox label={copy.outputPrice} value={model.output_price} tiers={model.output_price_tiers} showTiers />
          <PriceBox label={copy.cachedInputPrice} value={model.cached_input_price} tiers={model.cached_input_price_tiers} showTiers />
          <PriceBox label={copy.cacheWriteInputPrice} value={model.cache_write_input_price} tiers={model.cache_write_input_price_tiers} showTiers />
        </div>
      </div>
    </div>
  )
}

function PriceBox({
  label,
  value,
  tiers,
  showTiers = false,
}: {
  label: string
  value: string | number
  tiers?: PriceTier[]
  showTiers?: boolean
}) {
  const currency = useCurrencyDisplayName()
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold">{formatPrice(value, currency)}</div>
      {showTiers && <TierSummary tiers={tiers} />}
    </div>
  )
}

function PriceText({ value, tiers }: { value: string | number; tiers?: PriceTier[] }) {
  const currency = useCurrencyDisplayName()
  return (
    <div>
      <div>{formatPrice(value, currency)}</div>
      <TierSummary tiers={tiers} />
    </div>
  )
}

function TierSummary({ tiers }: { tiers?: PriceTier[] }) {
  const { language } = useI18n()
  const currency = useCurrencyDisplayName()
  const normalized = normalizePriceTiers(tiers || [])
  if (normalized.length === 0) {
    return null
  }
  return (
    <div className="mt-1 text-xs text-muted-foreground">
      {normalized.map((tier) => `${tierConditionLabel(tier.condition, language)} ${formatTokenCount(tier.min_tokens)}: ${formatPrice(tier.price, currency)}`).join(" / ")}
    </div>
  )
}

function providerFilterOptions(models: PublicModel[]) {
  const providers = new Map<string, string>()
  for (const model of models) {
    const key = providerKey(model)
    if (!key) {
      continue
    }
    providers.set(key, model.provider_name || model.provider || "-")
  }
  return Array.from(providers.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => compareText(a.label, b.label))
}

function channelFilterOptions(models: PublicModel[]) {
  const channels = new Map<string, string>()
  for (const model of models) {
    for (const channel of model.user_channels || []) {
      channels.set(String(channel.id), channel.name)
    }
  }
  return Array.from(channels.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => compareText(a.label, b.label))
}

function filterAndSortModels(
  models: PublicModel[],
  filters: { searchTerm: string; providerFilter: string; channelFilter: string; sortOrder: SortOrder }
) {
  const query = filters.searchTerm.trim().toLowerCase()
  return models
    .filter((model) => {
      if (filters.providerFilter && providerKey(model) !== filters.providerFilter) {
        return false
      }
      if (filters.channelFilter && !model.user_channels.some((channel) => String(channel.id) === filters.channelFilter)) {
        return false
      }
      if (!query) {
        return true
      }
      return searchableText(model).includes(query)
    })
    .map<ModelView>((model) => ({
      ...model,
      visible_user_channels: filters.channelFilter
        ? model.user_channels.filter((channel) => String(channel.id) === filters.channelFilter)
        : model.user_channels,
    }))
    .sort((a, b) => compareModels(a, b, filters.sortOrder))
}

function compareModels(a: ModelView, b: ModelView, sortOrder: SortOrder) {
  switch (sortOrder) {
    case "name_desc":
      return compareText(b.model_name, a.model_name)
    case "provider_asc":
      return compareText(a.provider_name || a.provider, b.provider_name || b.provider) || compareText(a.model_name, b.model_name)
    case "input_asc":
      return sortPrice(a, "input") - sortPrice(b, "input") || compareText(a.model_name, b.model_name)
    case "input_desc":
      return sortPrice(b, "input") - sortPrice(a, "input") || compareText(a.model_name, b.model_name)
    case "output_asc":
      return sortPrice(a, "output") - sortPrice(b, "output") || compareText(a.model_name, b.model_name)
    case "output_desc":
      return sortPrice(b, "output") - sortPrice(a, "output") || compareText(a.model_name, b.model_name)
    case "name_asc":
    default:
      return compareText(a.model_name, b.model_name)
  }
}

function sortPrice(model: ModelView, kind: "input" | "output") {
  const channels = model.visible_user_channels.length > 0 ? model.visible_user_channels : model.user_channels
  const fallback = kind === "input" ? numberValue(model.input_price) : numberValue(model.output_price)
  const values = channels
    .map((channel) => numberValue(kind === "input" ? channel.effective_input_price : channel.effective_output_price))
    .filter((value) => Number.isFinite(value))
  return values.length > 0 ? Math.min(...values) : fallback
}

function searchableText(model: PublicModel) {
  return [
    model.model_name,
    model.description || "",
    model.provider,
    model.provider_name,
    ...(model.referenced_models || []).map((item) => item.model_name),
    ...model.user_channels.flatMap((channel) => [channel.name, channel.description]),
  ].join(" ").toLowerCase()
}

function providerKey(model: PublicModel) {
  return model.provider || model.provider_name || ""
}

function showsMetaModelDetails(model: PublicModel) {
  return Boolean(model.is_meta_model && (model.referenced_models || []).length > 0)
}

function sortOptions(copy: typeof zhCopy): SelectOption[] {
  return [
    { value: "name_asc", label: copy.sortNameAsc },
    { value: "name_desc", label: copy.sortNameDesc },
    { value: "provider_asc", label: copy.sortProviderAsc },
    { value: "input_asc", label: copy.sortInputAsc },
    { value: "input_desc", label: copy.sortInputDesc },
    { value: "output_asc", label: copy.sortOutputAsc },
    { value: "output_desc", label: copy.sortOutputDesc },
  ]
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
}

function numberValue(value: string | number) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatPrice(value: string | number, currency: string) {
  const parsed = numberValue(value)
  return `${formatCurrency(parsed.toFixed(6), currency)} / 1M`
}

function formatTokenCount(value: number) {
  if (value >= 1000000) {
    return `${trimNumber(value / 1000000)}M`
  }
  if (value >= 1000) {
    return `${trimNumber(value / 1000)}K`
  }
  return String(value)
}

function trimNumber(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, "")
}

function normalizePriceTiers(tiers: PriceTier[]) {
  const byMinTokens = new Map<string, PriceTier>()
  for (const tier of tiers || []) {
    const minTokens = Math.max(0, Math.floor(Number(tier.min_tokens || 0)))
    const price = Number(tier.price || 0)
    if (!Number.isFinite(minTokens) || !Number.isFinite(price) || price < 0) {
      continue
    }
    const condition = normalizeTierCondition(tier.condition || "")
    byMinTokens.set(`${condition}:${minTokens}`, { min_tokens: minTokens, price, condition })
  }
  return Array.from(byMinTokens.values()).sort((a, b) => tierConditionSort(a.condition) - tierConditionSort(b.condition) || a.min_tokens - b.min_tokens)
}

function normalizeTierCondition(condition: string) {
  switch ((condition || "").trim()) {
    case "full_input_tokens":
    case "full_request_tokens":
    case "billable_input_tokens":
    case "billable_output_tokens":
      return condition
    default:
      return ""
  }
}

function tierConditionSort(condition?: string) {
  switch (normalizeTierCondition(condition || "")) {
    case "full_input_tokens":
      return 1
    case "full_request_tokens":
      return 2
    case "billable_input_tokens":
      return 3
    case "billable_output_tokens":
      return 4
    default:
      return 0
  }
}

function tierConditionLabel(condition: string | undefined, language: string) {
  const normalized = normalizeTierCondition(condition || "")
  if (normalized === "full_input_tokens") return language === "zh" ? "输入" : "Input"
  if (normalized === "full_request_tokens") return language === "zh" ? "总量" : "Total"
  if (normalized === "billable_input_tokens") return language === "zh" ? "计价输入" : "Billable input"
  if (normalized === "billable_output_tokens") return language === "zh" ? "计价输出" : "Billable output"
  return ""
}

function formatMultiplier(value: string | number) {
  const parsed = numberValue(value)
  return `${parsed.toFixed(4)}x`
}

const zhCopy = {
  title: "模型列表",
  loading: "加载中...",
  empty: "暂无可用模型",
  noResults: "没有匹配的模型",
  searchPlaceholder: "搜索模型、供应商或渠道",
  allProviders: "全部供应商",
  allChannels: "全部用户渠道",
  reset: "重置",
  sortNameAsc: "模型名称 A-Z",
  sortNameDesc: "模型名称 Z-A",
  sortProviderAsc: "供应商 A-Z",
  sortInputAsc: "输入价格从低到高",
  sortInputDesc: "输入价格从高到低",
  sortOutputAsc: "输出价格从低到高",
  sortOutputDesc: "输出价格从高到低",
  inputPrice: "输入价格",
  outputPrice: "输出价格",
  cachedInputPrice: "缓存命中价格",
  cacheWriteInputPrice: "缓存写入价格",
  userChannel: "用户渠道",
  multiplier: "倍率",
  effectiveInput: "计费输入价",
  effectiveOutput: "计费输出价",
  effectiveCachedInput: "缓存命中价",
  effectiveCacheWriteInput: "缓存写入价",
  metaModel: "元模型",
  billingActual: "实际调用计费",
  billingMeta: "独立计费",
  referencedModels: "涉及模型及价格",
  actualBillingDescription: "按实际调用的真实模型计费，不公开 DSL 内容。",
  metaBillingDescription: "按元模型独立价格计费，下方仅展示可能涉及的真实模型。",
}

const enCopy: typeof zhCopy = {
  title: "Models",
  loading: "Loading...",
  empty: "No models available",
  noResults: "No matching models",
  searchPlaceholder: "Search models, providers, or channels",
  allProviders: "All providers",
  allChannels: "All user channels",
  reset: "Reset",
  sortNameAsc: "Model name A-Z",
  sortNameDesc: "Model name Z-A",
  sortProviderAsc: "Provider A-Z",
  sortInputAsc: "Input price low to high",
  sortInputDesc: "Input price high to low",
  sortOutputAsc: "Output price low to high",
  sortOutputDesc: "Output price high to low",
  inputPrice: "Input price",
  outputPrice: "Output price",
  cachedInputPrice: "Cache hit price",
  cacheWriteInputPrice: "Cache write price",
  userChannel: "User channel",
  multiplier: "Multiplier",
  effectiveInput: "Effective input",
  effectiveOutput: "Effective output",
  effectiveCachedInput: "Cached input",
  effectiveCacheWriteInput: "Cache write price",
  metaModel: "Meta model",
  billingActual: "Actual billing",
  billingMeta: "Meta billing",
  referencedModels: "Referenced models and pricing",
  actualBillingDescription: "Billed by the actual called model. DSL content is not exposed.",
  metaBillingDescription: "Billed by the meta model price. Referenced real models are shown for visibility.",
}
