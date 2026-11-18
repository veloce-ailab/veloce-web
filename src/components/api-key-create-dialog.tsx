import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Copy, Plus, X } from "lucide-react"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
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
import { useToast } from "@/components/ui/toast"
import { DateTimePicker } from "@/components/ui/date-picker"
import { parseCSV, parseQuotaLimit } from "@/lib/api-key-form"

// Shared API key ("令牌") creation dialog. It is used by the API keys page and
// by the third-party authorization page, so both surfaces always create tokens
// with exactly the same fields and validation.

export interface UserChannelCatalog {
  id: number
  name: string
  description: string
  multiplier: string | number
  models: string[]
}

export interface APIKeyPayload {
  name: string
  allowed_models: string[]
  allowed_user_channels: number[]
  allowed_ips: string[]
  quota_limit?: string
  enabled?: boolean
  expires_at?: string
  clear_expiration?: boolean
  billing_sources?: string[]
}

export interface CreatedAPIKey {
  id: number
  name: string
  api_key?: string
  key_prefix: string
  enabled?: boolean
  expires_at?: string | null
  created_at?: string
}

export interface CreateAPIKeyResponse {
  api_key: string
  key: CreatedAPIKey
}

interface APIKeyCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: UserChannelCatalog[]
  personalMode: boolean
  onCreated?: (result: CreateAPIKeyResponse) => void
}

export function APIKeyCreateDialog({ open, onOpenChange, catalog, personalMode, onCreated }: APIKeyCreateDialogProps) {
  const queryClient = useQueryClient()
  const { language, t } = useI18n()
  const { success, error } = useToast()
  const [newRawKey, setNewRawKey] = useState("")
  const [newName, setNewName] = useState("")
  const [newChannelIds, setNewChannelIds] = useState<number[]>([])
  const [newModels, setNewModels] = useState<string[]>([])
  const [newIPs, setNewIPs] = useState("")
  const [newQuotaLimit, setNewQuotaLimit] = useState("")
  const [newExpiresAt, setNewExpiresAt] = useState("")

  const resetFields = () => {
    setNewRawKey("")
    setNewName("")
    setNewChannelIds([])
    setNewModels([])
    setNewIPs("")
    setNewQuotaLimit("")
    setNewExpiresAt("")
  }

  const copyValue = async (value: string) => {
    if (!value) {
      return
    }
    await navigator.clipboard.writeText(value)
    success(t("settings.keyCopied"))
  }

  const createAPIKey = useMutation<CreateAPIKeyResponse>({
    mutationFn: async () => {
      const payload: APIKeyPayload = {
        name: newName || "API key",
        allowed_models: newModels,
        allowed_user_channels: personalMode ? [] : newChannelIds,
        allowed_ips: parseCSV(newIPs),
        quota_limit: personalMode ? "0" : parseQuotaLimit(newQuotaLimit),
        ...(newExpiresAt ? { expires_at: new Date(newExpiresAt).toISOString() } : {}),
      }
      const res = await api.post("/user/api-keys", payload)
      return res.data
    },
    onSuccess: (data) => {
      setNewRawKey(data.api_key)
      success(t("settings.keyCreated"))
      setNewName("")
      setNewChannelIds([])
      setNewModels([])
      setNewIPs("")
      setNewQuotaLimit("")
      setNewExpiresAt("")
      queryClient.invalidateQueries({ queryKey: ["api-keys"] })
      onCreated?.(data)
    },
    onError: () => error(t("settings.keyCreateFailed")),
  })

  const closeDialog = () => {
    resetFields()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          closeDialog()
        }
      }}
    >
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
              channelIds={newChannelIds}
              models={newModels}
              onChannelIdsChange={(channelIds) => {
                setNewChannelIds(channelIds)
                setNewModels([])
              }}
              onModelsChange={setNewModels}
            />
          )}
          <FieldLabel label={language === "zh" ? "过期时间" : "Expiration time"}>
            <DateTimePicker value={newExpiresAt} onValueChange={setNewExpiresAt} />
          </FieldLabel>
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
          <Button variant="outline" onClick={closeDialog}>
            {newRawKey ? t("common.close") : t("common.cancel")}
          </Button>
          {!newRawKey && (
            <Button
              className="gap-2"
              onClick={() => createAPIKey.mutate()}
              disabled={createAPIKey.isPending || (!personalMode && newChannelIds.length === 0)}
            >
              <Plus size={16} />
              {createAPIKey.isPending ? t("settings.creatingKey") : t("settings.createKey")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2 block text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}

export function RestrictionPicker({
  catalog,
  channelIds,
  models,
  onChannelIdsChange,
  onModelsChange,
}: {
  catalog: UserChannelCatalog[]
  channelIds: number[]
  models: string[]
  onChannelIdsChange: (value: number[]) => void
  onModelsChange: (value: string[]) => void
}) {
  const { t } = useI18n()
  const [customMode, setCustomMode] = useState(channelIds.length > 1)
  const isCustom = customMode || channelIds.length > 1
  const modelOptions = modelOptionsForChannels(catalog, channelIds, models)
  const selectedChannel = !isCustom ? catalog.find((channel) => channel.id === (channelIds[0] || 0)) : undefined
  const remainingChannels = catalog.filter((channel) => !channelIds.includes(channel.id))

  const selectValue = isCustom ? "__custom__" : String((channelIds[0] || "") || "__shadcn_empty__")
  const handleSelect = (value: string) => {
    if (value === "__custom__") {
      setCustomMode(true)
      return
    }
    setCustomMode(false)
    const id = Number(value === "__shadcn_empty__" ? "" : value) || 0
    onChannelIdsChange(id ? [id] : [])
  }

  const moveChannel = (index: number, delta: number) => {
    const next = [...channelIds]
    const swap = index + delta
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    onChannelIdsChange(next)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <div className="text-sm font-medium">{t("settings.userChannels")}</div>
        <Select value={selectValue} onValueChange={handleSelect}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue>
          {isCustom ? (
            t("settings.customAutoChannel")
          ) : selectedChannel ? (
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
          <SelectItem value="__custom__">
            <span className="flex min-w-0 flex-col py-0.5 text-left">
              <span className="truncate">{t("settings.customAutoChannel")}</span>
              <span className="max-w-80 truncate text-xs text-muted-foreground">{t("settings.autoChannelHint")}</span>
            </span>
          </SelectItem>
        </SelectContent></Select>
        {!isCustom && selectedChannel?.description && (
          <div className="text-xs text-muted-foreground">{selectedChannel.description}</div>
        )}
        {isCustom && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="text-xs text-muted-foreground">{t("settings.autoChannelHint")}</div>
            {channelIds.length === 0 ? (
              <div className="text-sm text-muted-foreground">{t("settings.autoChannelEmpty")}</div>
            ) : (
              <div className="space-y-1">
                {channelIds.map((id, index) => {
                  const channel = catalog.find((item) => item.id === id)
                  return (
                    <div key={id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
                      <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{channel?.name || `#${id}`}</span>
                      {channel && (
                        <span className="shrink-0 text-xs text-muted-foreground">×{formatMultiplier(channel.multiplier)}</span>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={() => moveChannel(index, -1)}>
                        <ArrowUp size={12} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === channelIds.length - 1} onClick={() => moveChannel(index, 1)}>
                        <ArrowDown size={12} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-500 hover:text-red-600"
                        onClick={() => onChannelIdsChange(channelIds.filter((item) => item !== id))}
                      >
                        <X size={12} />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
            {remainingChannels.length > 0 && (
              <Select value="__shadcn_empty__" onValueChange={(value) => {
                const id = Number(value === "__shadcn_empty__" ? "" : value) || 0
                if (id && !channelIds.includes(id)) {
                  onChannelIdsChange([...channelIds, id])
                }
              }}><SelectTrigger className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm"><SelectValue>
                {t("settings.addAutoChannel")}
              </SelectValue></SelectTrigger><SelectContent>
                <SelectItem value="__shadcn_empty__">{t("settings.addAutoChannel")}</SelectItem>
                {remainingChannels.map((channel) => (
                  <SelectItem key={channel.id} value={String(channel.id)}>
                    <span className="flex items-center gap-2">
                      <span className="truncate">{channel.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">×{formatMultiplier(channel.multiplier)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent></Select>
            )}
          </div>
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

function modelOptionsForChannels(catalog: UserChannelCatalog[], channelIds: number[], selectedModels: string[]) {
  const modelSet = new Set<string>(selectedModels)
  for (const channelId of channelIds) {
    const channel = catalog.find((item) => item.id === channelId)
    if (!channel) {
      continue
    }
    for (const modelName of channel.models) {
      modelSet.add(modelName)
    }
  }
  return Array.from(modelSet).sort()
}

function toggleString(items: string[], item: string) {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item]
}

function formatMultiplier(value: string | number) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "1"
}
