import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, Plus, RotateCcw, RotateCw, Save, Trash } from "lucide-react"
import api, { apiURL } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import type { PublicSettings } from "@/lib/public-settings"
import { isPersonalMode, withPublicSettingsDefaults } from "@/lib/public-settings"
import { formatCurrency } from "@/lib/currency"
import { APIKeyImportDialog } from "@/components/api-key-import-dialog"

interface UserChannelCatalog {
  id: number
  name: string
  description: string
  multiplier: string | number
  models: string[]
}

interface APIKey {
  id: number
  name: string
  api_key: string
  key_prefix: string
  allowed_models: string[]
  allowed_user_channels: number[]
  allowed_ips: string[]
  quota_limit: string | number
  quota_remaining?: string | number | null
  enabled: boolean
  usage: UsageStats
  last_used_at?: string | null
  usage_reset_at?: string | null
  created_at: string
}

interface UsageStats {
  request_count: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
  total_cost: string | number
}

interface CreateAPIKeyResponse {
  api_key: string
  key: APIKey
}

interface APIKeyPayload {
  name: string
  allowed_models: string[]
  allowed_user_channels: number[]
  allowed_ips: string[]
  quota_limit?: string
  enabled?: boolean
}

export default function APIKeys() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { language, t } = useI18n()
  const { success, error } = useToast()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newRawKey, setNewRawKey] = useState("")
  const [newName, setNewName] = useState("")
  const [newChannelId, setNewChannelId] = useState(0)
  const [newModels, setNewModels] = useState<string[]>([])
  const [newIPs, setNewIPs] = useState("")
  const [newQuotaLimit, setNewQuotaLimit] = useState("")
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const currency = publicSettings.payment_currency_display_name
  const personalMode = isPersonalMode(publicSettings)

  const { data: catalog = [] } = useQuery<UserChannelCatalog[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalogItem) : []
    },
  })

  const { data: apiKeys = [] } = useQuery<APIKey[]>({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await api.get("/user/api-keys")
      return Array.isArray(res.data) ? res.data.map(normalizeAPIKey) : []
    },
  })
  const normalizedAPIKeys = Array.isArray(apiKeys) ? apiKeys.map(normalizeAPIKey) : []

  const createAPIKey = useMutation<CreateAPIKeyResponse>({
    mutationFn: async () => {
      const payload: APIKeyPayload = {
        name: newName || "API key",
        allowed_models: newModels,
        allowed_user_channels: personalMode ? [] : newChannelId ? [newChannelId] : [],
        allowed_ips: parseCSV(newIPs),
        quota_limit: personalMode ? "0" : parseQuotaLimit(newQuotaLimit),
      }
      const res = await api.post("/user/api-keys", payload)
      return res.data
    },
    onSuccess: (data) => {
      setNewRawKey(data.api_key)
      success(t("settings.keyCreated"))
      setNewName("")
      setNewChannelId(0)
      setNewModels([])
      setNewIPs("")
      setNewQuotaLimit("")
      queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: () => error(t("settings.keyCreateFailed")),
  })

  const updateAPIKey = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: APIKeyPayload }) => {
      const res = await api.put(`/user/api-keys/${id}`, payload)
      return res.data
    },
    onSuccess: () => {
      success(t("settings.keyUpdated"))
      queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: () => error(t("settings.keyUpdateFailed")),
  })

  const deleteAPIKey = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/user/api-keys/${id}`)
    },
    onSuccess: () => {
      success(t("settings.keyDeleted"))
      queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: () => error(t("settings.keyDeleteFailed")),
  })

  const rotateAPIKey = useMutation<CreateAPIKeyResponse, Error, number>({
    mutationFn: async (id) => {
      const res = await api.post(`/user/api-keys/${id}/rotate`)
      return res.data
    },
    onSuccess: (data) => {
      setNewRawKey(data.api_key)
      success(t("settings.keyRotated"))
      queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: () => error(t("settings.keyRotateFailed")),
  })

  const resetAPIKeyUsage = useMutation<APIKey, Error, number>({
    mutationFn: async (id) => {
      const res = await api.post(`/user/api-keys/${id}/reset-usage`)
      return normalizeAPIKey(res.data)
    },
    onSuccess: () => {
      success(t("settings.keyUsageReset"))
      queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: () => error(t("settings.keyUsageResetFailed")),
  })

  const copyValue = async (value: string) => {
    if (!value) {
      return
    }
    await navigator.clipboard.writeText(value)
    success(t("settings.keyCopied"))
  }

  const openCreateDialog = () => {
    setNewRawKey("")
    setIsCreateOpen(true)
  }

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      openCreateDialog()
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const closeCreateDialog = () => {
    setIsCreateOpen(false)
    setNewRawKey("")
    setNewName("")
    setNewChannelId(0)
    setNewModels([])
    setNewIPs("")
    setNewQuotaLimit("")
  }

  const confirmDeleteAPIKey = async (id: number, name: string) => {
    const description = language === "zh" ? `确定要删除令牌“${name || "API key"}”吗？此操作无法撤销。` : `Delete API key “${name || "API key"}”? This cannot be undone.`
    if (await confirm({ description })) deleteAPIKey.mutate(id)
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("settings.apiKeys")}</h1>
          <div className="mt-2 text-sm text-muted-foreground">{t("settings.apiKeysSubtitle")}</div>
        </div>
        <Button className="gap-2" onClick={openCreateDialog}>
          <Plus size={16} />
          {t("settings.createKey")}
        </Button>
      </div>

      <PageTitleSlot />
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.apiKeys")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {normalizedAPIKeys.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("settings.noKeys")}</div>
          ) : (
            normalizedAPIKeys.map((apiKey) => (
              <APIKeyRow
                key={apiKey.id}
                apiKey={apiKey}
                catalog={catalog}
                onSave={(id, payload) => updateAPIKey.mutate({ id, payload })}
                onDelete={confirmDeleteAPIKey}
                onRotate={(id) => rotateAPIKey.mutate(id)}
                onResetUsage={(id) => resetAPIKeyUsage.mutate(id)}
                onCopy={copyValue}
                personalMode={personalMode}
                currency={currency}
              />
            ))
          )}
        </CardContent>
      </Card>

      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("settings.createKey")}</DialogTitle>
            <DialogDescription>{t("settings.apiKeysSubtitle")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FieldLabel label={t("settings.keyName")}>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("settings.keyName")} />
            </FieldLabel>
            {!personalMode && (
              <RestrictionPicker
                catalog={catalog}
                channelId={newChannelId}
                models={newModels}
                onChannelIdChange={(channelId) => {
                  setNewChannelId(channelId)
                  setNewModels([])
                }}
                onModelsChange={setNewModels}
              />
            )}
            <FieldLabel label={t("settings.allowedIPs")}>
              <Input value={newIPs} onChange={(e) => setNewIPs(e.target.value)} placeholder={t("settings.ipsPlaceholder")} />
            </FieldLabel>
            {!personalMode && (
              <FieldLabel label={t("settings.quotaLimit")}>
                <Input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={newQuotaLimit}
                  onChange={(e) => setNewQuotaLimit(e.target.value)}
                  placeholder={t("settings.quotaPlaceholder")}
                />
              </FieldLabel>
            )}
          </div>

          {newRawKey && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="text-sm font-medium">{t("settings.newKey")}</div>
              <div className="text-xs text-muted-foreground">{t("settings.keyStored")}</div>
              <div className="flex gap-2">
                <Input readOnly value={newRawKey} className="font-mono text-xs" placeholder={t("settings.newKey")} />
                <Button variant="outline" size="icon" onClick={() => copyValue(newRawKey)} title={t("settings.copyKey")}>
                  <Copy size={16} />
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeCreateDialog}>
              {newRawKey ? t("common.close") : t("common.cancel")}
            </Button>
            {!newRawKey && (
              <Button className="gap-2" onClick={() => createAPIKey.mutate()} disabled={createAPIKey.isPending || (!personalMode && !newChannelId)}>
                <Plus size={16} />
                {createAPIKey.isPending ? t("settings.creatingKey") : t("settings.createKey")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function APIKeyRow({
  apiKey,
  catalog,
  onSave,
  onDelete,
  onRotate,
  onResetUsage,
  onCopy,
  personalMode,
  currency,
}: {
  apiKey: APIKey
  catalog: UserChannelCatalog[]
  onSave: (id: number, payload: APIKeyPayload) => void
  onDelete: (id: number, name: string) => void
  onRotate: (id: number) => void
  onResetUsage: (id: number) => void
  onCopy: (value: string) => void
  personalMode: boolean
  currency: string
}) {
  const { language, t } = useI18n()
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [isImportConfigOpen, setIsImportConfigOpen] = useState(false)
  const allowedChannels = numberArray(apiKey.allowed_user_channels)
  const allowedModels = stringArray(apiKey.allowed_models)
  const allowedIPs = stringArray(apiKey.allowed_ips)
  const [name, setName] = useState(apiKey.name)
  const [channelId, setChannelId] = useState(allowedChannels[0] || 0)
  const [models, setModels] = useState(allowedModels)
  const [ips, setIPs] = useState(allowedIPs.join(","))
  const [quotaLimit, setQuotaLimit] = useState(quotaInputValue(apiKey.quota_limit))

  const payload = (enabled = apiKey.enabled): APIKeyPayload => ({
    name,
    allowed_models: models,
    allowed_user_channels: personalMode ? [] : channelId ? [channelId] : [],
    allowed_ips: parseCSV(ips),
    quota_limit: personalMode ? "0" : parseQuotaLimit(quotaLimit),
    enabled,
  })

  const resetConfigState = () => {
    setName(apiKey.name)
    setChannelId(numberArray(apiKey.allowed_user_channels)[0] || 0)
    setModels(stringArray(apiKey.allowed_models))
    setIPs(stringArray(apiKey.allowed_ips).join(","))
    setQuotaLimit(quotaInputValue(apiKey.quota_limit))
  }

  const saveConfig = () => {
    onSave(apiKey.id, payload())
    setIsConfigOpen(false)
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">{apiKey.name}</div>
          <div className="text-xs text-muted-foreground">
            {t("settings.keyPrefix")}: {apiKey.key_prefix}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsConfigOpen(true)}>
            {t("settings.configure")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onSave(apiKey.id, payload(!apiKey.enabled))}>
            {apiKey.enabled ? t("settings.disable") : t("settings.enable")}
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => onResetUsage(apiKey.id)} title={t("settings.resetUsage")}>
            <RotateCcw size={14} />
            {t("settings.resetUsage")}
          </Button>
          <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600" onClick={() => onDelete(apiKey.id, apiKey.name)}>
            <Trash size={14} />
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Input readOnly value={apiKey.api_key || apiKey.key_prefix} className="font-mono text-xs" />
        <Button
          variant="outline"
          size="icon"
          onClick={() => onCopy(apiKey.api_key)}
          title={t("settings.copyKey")}
          disabled={!apiKey.api_key}
        >
          <Copy size={16} />
        </Button>
        <Button variant="outline" size="icon" onClick={() => onRotate(apiKey.id)} title={t("settings.rotateKey")}>
          <RotateCw size={16} />
        </Button>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => setIsImportConfigOpen(true)} disabled={!apiKey.api_key}>
          {language === "zh" ? "导入配置" : "Import config"}
        </Button>
      </div>

      <div className="text-sm text-muted-foreground">
        {t("settings.scopeSummary", {
          channels: personalMode ? t("settings.unrestricted") : channelName(catalog, allowedChannels[0] || 0) || "-",
          models: allowedModels.length || t("settings.unrestricted"),
          ips: allowedIPs.length || t("settings.unrestricted"),
        })}
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-4">
        <UsageBox label={t("settings.requests")} value={formatInteger(apiKey.usage.request_count)} />
        <UsageBox label={t("settings.totalTokens")} value={formatInteger(apiKey.usage.total_tokens)} />
        <UsageBox label={t("settings.inputTokens")} value={formatInteger(apiKey.usage.input_tokens)} />
        <UsageBox label={t("settings.totalCost")} value={formatCost(apiKey.usage.total_cost, currency)} />
        {!personalMode && <UsageBox label={t("settings.quotaRemaining")} value={formatQuotaRemaining(apiKey, t("settings.unlimitedQuota"), currency)} />}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>
          {t("settings.lastUsed")}: {apiKey.last_used_at ? new Date(apiKey.last_used_at).toLocaleString() : "-"}
        </div>
        <div>
          {t("settings.usageResetAt")}: {apiKey.usage_reset_at ? new Date(apiKey.usage_reset_at).toLocaleString() : "-"}
        </div>
        <div>
          {t("settings.createdAt")}: {new Date(apiKey.created_at).toLocaleString()}
        </div>
      </div>

      <Dialog
        open={isConfigOpen}
        onOpenChange={(open) => {
          setIsConfigOpen(open)
          if (!open) {
            resetConfigState()
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("settings.configureKey")}</DialogTitle>
            <DialogDescription>{apiKey.key_prefix}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FieldLabel label={t("settings.keyName")}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.keyName")} />
            </FieldLabel>
            {!personalMode && (
              <RestrictionPicker
                catalog={catalog}
                channelId={channelId}
                models={models}
                onChannelIdChange={(nextChannelId) => {
                  setChannelId(nextChannelId)
                  setModels([])
                }}
                onModelsChange={setModels}
              />
            )}
            <FieldLabel label={t("settings.allowedIPs")}>
              <Input value={ips} onChange={(e) => setIPs(e.target.value)} placeholder={t("settings.ipsPlaceholder")} />
            </FieldLabel>
            {!personalMode && (
              <FieldLabel label={t("settings.quotaLimit")}>
                <Input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={quotaLimit}
                  onChange={(e) => setQuotaLimit(e.target.value)}
                  placeholder={t("settings.quotaPlaceholder")}
                />
              </FieldLabel>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button className="gap-2" onClick={saveConfig} disabled={!personalMode && !channelId}>
              <Save size={14} />
              {t("settings.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <APIKeyImportDialog
        open={isImportConfigOpen}
        onOpenChange={setIsImportConfigOpen}
        apiKey={apiKey.api_key}
        apiKeyName={apiKey.name}
        baseURL={apiBaseURLForConfig()}
        onCopy={onCopy}
        language={language}
      />
    </div>
  )
}

function apiBaseURLForConfig() {
  const configured = apiURL("/").replace(/\/+$/, "")
  if (configured) {
    return configured
  }
  return typeof window === "undefined" ? "http://localhost:8080" : window.location.origin
}

function RestrictionPicker({
  catalog,
  channelId,
  models,
  onChannelIdChange,
  onModelsChange,
}: {
  catalog: UserChannelCatalog[]
  channelId: number
  models: string[]
  onChannelIdChange: (value: number) => void
  onModelsChange: (value: string[]) => void
}) {
  const { t } = useI18n()
  const modelOptions = modelOptionsForChannel(catalog, channelId, models)
  const selectedChannel = catalog.find((channel) => channel.id === channelId)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <div className="text-sm font-medium">{t("settings.userChannels")}</div>
        <Select value={String((channelId || "") || "__shadcn_empty__")} onValueChange={(value) => onChannelIdChange(Number((value === "__shadcn_empty__" ? "" : value)) || 0)}><SelectTrigger className="h-10 w-full rounded-2xl border bg-background px-3 text-sm"><SelectValue>
          {selectedChannel ? (
            <span className="flex items-center gap-2">
              <span className="truncate">{selectedChannel.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">×{formatMultiplier(selectedChannel.multiplier)}</span>
            </span>
          ) : (
            t("admin.selectUserChannel")
          )}
        </SelectValue></SelectTrigger><SelectContent>
          <SelectItem value="__shadcn_empty__">{t("admin.selectUserChannel")}</SelectItem>
          {catalog.map((channel) => (
            <SelectItem key={channel.id} value={String(channel.id)}>
              <span className="flex min-w-0 flex-col py-0.5 text-left">
                <span className="flex items-center gap-2">
                  <span className="truncate">{channel.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t("channels.multiplier")} ×{formatMultiplier(channel.multiplier)}</span>
                </span>
                {channel.description && (
                  <span className="max-w-80 truncate text-xs text-muted-foreground">{channel.description}</span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent></Select>
        {selectedChannel?.description && (
          <div className="text-xs text-muted-foreground">{selectedChannel.description}</div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">{t("settings.modelScope")}</div>
        <div className="text-xs text-muted-foreground">{t("settings.noLimit")}</div>
        <div className="grid max-h-48 gap-2 overflow-auto rounded-md border p-3">
          {modelOptions.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("settings.noModelsAvailable")}</div>
          ) : (
            modelOptions.map((modelName) => (
              <label key={modelName} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={models.includes(modelName)}
                  onChange={() => onModelsChange(toggleString(models, modelName))}
                />
                <span className="font-mono text-xs">{modelName}</span>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function UsageBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm font-medium">{value}</div>
    </div>
  )
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2 block text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}

function modelOptionsForChannel(catalog: UserChannelCatalog[], channelId: number, selectedModels: string[]) {
  const modelSet = new Set<string>(selectedModels)
  const channel = catalog.find((item) => item.id === channelId)
  if (!channel) {
    return Array.from(modelSet).sort()
  }
  for (const modelName of channel.models) {
    modelSet.add(modelName)
  }
  return Array.from(modelSet).sort()
}

function toggleString(items: string[], item: string) {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item]
}

function channelName(catalog: UserChannelCatalog[], id: number) {
  return catalog.find((channel) => channel.id === id)?.name || ""
}

function formatMultiplier(value: string | number) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "1"
}

function parseCSV(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : []
}

function normalizeUsage(value: unknown): UsageStats {
  const item = isRecord(value) ? value : {}
  return {
    request_count: Number(item.request_count || 0),
    input_tokens: Number(item.input_tokens || 0),
    output_tokens: Number(item.output_tokens || 0),
    total_tokens: Number(item.total_tokens || 0),
    total_cost: typeof item.total_cost === "string" || typeof item.total_cost === "number" ? item.total_cost : 0,
  }
}

function normalizeAPIKey(value: unknown): APIKey {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    api_key: typeof item.api_key === "string" ? item.api_key : "",
    key_prefix: typeof item.key_prefix === "string" ? item.key_prefix : "",
    allowed_models: stringArray(item.allowed_models),
    allowed_user_channels: numberArray(item.allowed_user_channels),
    allowed_ips: stringArray(item.allowed_ips),
    quota_limit: typeof item.quota_limit === "string" || typeof item.quota_limit === "number" ? item.quota_limit : 0,
    quota_remaining:
      typeof item.quota_remaining === "string" || typeof item.quota_remaining === "number" ? item.quota_remaining : null,
    enabled: Boolean(item.enabled),
    usage: normalizeUsage(item.usage),
    last_used_at: typeof item.last_used_at === "string" ? item.last_used_at : null,
    usage_reset_at: typeof item.usage_reset_at === "string" ? item.usage_reset_at : null,
    created_at: typeof item.created_at === "string" ? item.created_at : new Date(0).toISOString(),
  }
}

function normalizeCatalogItem(value: unknown): UserChannelCatalog {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    description: typeof item.description === "string" ? item.description : "",
    multiplier: typeof item.multiplier === "string" || typeof item.multiplier === "number" ? item.multiplier : 1,
    models: stringArray(item.models),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function formatInteger(value: number) {
  return new Intl.NumberFormat().format(Number.isFinite(value) ? value : 0)
}

function formatCost(value: string | number, currency: string) {
  const parsed = Number(value || 0)
  return formatCurrency((Number.isFinite(parsed) ? parsed : 0).toFixed(6), currency)
}

function parseQuotaLimit(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return "0"
  }
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return "0"
  }
  return trimmed
}

function quotaInputValue(value: string | number) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return ""
  }
  return String(value)
}

function formatQuotaRemaining(apiKey: APIKey, unlimitedLabel: string, currency: string) {
  const limit = Number(apiKey.quota_limit || 0)
  if (!Number.isFinite(limit) || limit <= 0) {
    return unlimitedLabel
  }
  const remaining = Number(apiKey.quota_remaining ?? Math.max(0, limit - Number(apiKey.usage.total_cost || 0)))
  const safeRemaining = Number.isFinite(remaining) ? Math.max(0, remaining) : 0
  return `${formatCurrency(safeRemaining.toFixed(6), currency)} / ${formatCurrency(limit.toFixed(6), currency)}`
}
