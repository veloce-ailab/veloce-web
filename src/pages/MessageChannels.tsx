import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, MessageSquare, Plus, Power, Save, Trash2 } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface UserChannelCatalog {
  id: number
  name: string
  models: string[]
}

interface Agent {
  id: number
  name: string
}

interface Skill {
  id: number
  name: string
}

interface Device {
  id: string
  name: string
  online: boolean
}

interface GroupConfig {
  external_id: string
  name: string
  enabled: boolean
  device_id: string
  user_channel_id?: number | null
  model: string
  agent_id?: number | null
  skill_ids: number[]
  context_message_count: number
  reply_mode: string
  trigger_mode: string
  system_prompt_override: string
}

interface AdvancedOptions {
  custom_provider_config_json: string
}

interface MessageChannel {
  id: number
  name: string
  provider: ChannelProvider | string
  enabled: boolean
  bot_token_configured: boolean
  bot_token_preview?: string
  webhook_path: string
  default_device_id: string
  default_user_channel_id?: number | null
  default_model: string
  default_agent_id?: number | null
  default_skill_ids: number[]
  default_context_message_count: number
  reply_mode: string
  trigger_mode: string
  system_prompt: string
  group_configs: GroupConfig[]
  advanced_options: AdvancedOptions
  last_event_at?: string
}

interface Draft {
  id?: number
  name: string
  provider: ChannelProvider
  bot_token: string
  enabled: boolean
  default_device_id: string
  default_user_channel_id: string
  default_model: string
  default_agent_id: string
  default_skill_ids: number[]
  default_context_message_count: string
  reply_mode: string
  trigger_mode: string
  system_prompt: string
  group_configs: GroupConfig[]
  advanced_options: AdvancedOptions
}

const emptyDraft: Draft = {
  name: "",
  provider: "telegram",
  bot_token: "",
  enabled: true,
  default_device_id: "",
  default_user_channel_id: "",
  default_model: "",
  default_agent_id: "",
  default_skill_ids: [],
  default_context_message_count: "12",
  reply_mode: "mention",
  trigger_mode: "mention",
  system_prompt: "",
  group_configs: [],
  advanced_options: { custom_provider_config_json: "" },
}

const channelQueryKey = ["message-channels"] as const
type ChannelProvider = "telegram" | "discord" | "qq" | "onebot"
const providerOptions: Array<{ value: ChannelProvider; label: string }> = [
  { value: "telegram", label: "Telegram" },
  { value: "discord", label: "Discord" },
  { value: "qq", label: "QQ 官方机器人" },
  { value: "onebot", label: "OneBot" },
]

export default function MessageChannels() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [activeID, setActiveID] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)

  const { data: settings } = useQuery<{ enabled: boolean }>({
    queryKey: ["message-channel-settings"],
    queryFn: async () => {
      const res = await api.get("/user/message-channels/settings")
      return { enabled: res.data?.enabled === true }
    },
  })

  const { data: channels = [] } = useQuery<MessageChannel[]>({
    queryKey: channelQueryKey,
    enabled: settings?.enabled === true,
    queryFn: async () => {
      const res = await api.get("/user/message-channels")
      return Array.isArray(res.data) ? res.data.map(normalizeChannel).filter(Boolean) as MessageChannel[] : []
    },
  })

  const { data: catalog = [] } = useQuery<UserChannelCatalog[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalogItem) : []
    },
  })

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["advanced-chat-agents"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agents")
      return Array.isArray(res.data) ? res.data.map(normalizeIDName).filter(Boolean) as Agent[] : []
    },
  })

  const { data: skills = [] } = useQuery<Skill[]>({
    queryKey: ["advanced-chat-skills"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/skills")
      return Array.isArray(res.data) ? res.data.map(normalizeIDName).filter(Boolean) as Skill[] : []
    },
  })

  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["advanced-chat-connector-devices"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/devices")
      return Array.isArray(res.data) ? res.data.map(normalizeDevice).filter(Boolean) as Device[] : []
    },
  })

  const activeChannel = channels.find((channel) => channel.id === activeID)
  const modelOptions = useMemo(() => uniqueModels(catalog), [catalog])
  const selectedUserChannel = catalog.find((item) => String(item.id) === draft.default_user_channel_id)
  const defaultModelOptions = selectedUserChannel?.models.length ? selectedUserChannel.models : modelOptions
  const providerConfig = parseProviderConfig(draft.advanced_options.custom_provider_config_json)
  const qqConnectionMode = normalizeQQConnectionMode(providerConfig.connection_mode)
  const updateProviderConfig = (key: string, value: string) => {
    const next = { ...providerConfig }
    if (value.trim() === "") {
      delete next[key]
    } else {
      next[key] = value
    }
    setDraft((current) => ({
      ...current,
      advanced_options: { ...current.advanced_options, custom_provider_config_json: stringifyProviderConfig(next) },
    }))
  }

  useEffect(() => {
    if (activeChannel) {
      setDraft(channelToDraft(activeChannel))
    } else if (channels.length > 0 && activeID === null) {
      setActiveID(channels[0].id)
    }
  }, [activeChannel, activeID, channels])

  const saveChannel = useMutation({
    mutationFn: async () => {
      const payload = draftToPayload(draft)
      const res = draft.id
        ? await api.put(`/user/message-channels/${draft.id}`, payload)
        : await api.post("/user/message-channels", payload)
      return normalizeChannel(res.data)
    },
    onSuccess: (saved) => {
      success(copy.saved)
      queryClient.invalidateQueries({ queryKey: channelQueryKey })
      if (saved) {
        setActiveID(saved.id)
        setDraft(channelToDraft(saved))
      }
    },
    onError: (err) => error(apiErrorMessage(err, copy.saveFailed)),
  })

  const deleteChannel = useMutation({
    mutationFn: async (id: number) => api.delete(`/user/message-channels/${id}`),
    onSuccess: () => {
      success(copy.deleted)
      setActiveID(null)
      setDraft(emptyDraft)
      queryClient.invalidateQueries({ queryKey: channelQueryKey })
    },
    onError: (err) => error(apiErrorMessage(err, copy.deleteFailed)),
  })
  const toggleChannel = useMutation({
    mutationFn: async () => api.post(`/user/message-channels/${draft.id}/${draft.enabled ? "disable" : "enable"}`),
    onSuccess: () => {
      success(draft.enabled ? copy.disabledSaved : copy.enabledSaved)
      setDraft((current) => ({ ...current, enabled: !current.enabled }))
      queryClient.invalidateQueries({ queryKey: channelQueryKey })
    },
    onError: (err) => error(apiErrorMessage(err, copy.saveFailed)),
  })

  const startCreate = () => {
    setActiveID(0)
    setDraft({ ...emptyDraft, name: copy.defaultName })
  }

  const addGroup = () => {
    setDraft((current) => ({
      ...current,
      group_configs: [
        ...current.group_configs,
        {
          external_id: "",
          name: "",
          enabled: true,
          device_id: "",
          user_channel_id: null,
          model: "",
          agent_id: null,
          skill_ids: [],
          context_message_count: Number(current.default_context_message_count) || 12,
          reply_mode: "",
          trigger_mode: "",
          system_prompt_override: "",
        },
      ],
    }))
  }

  const updateGroup = (index: number, patch: Partial<GroupConfig>) => {
    setDraft((current) => ({
      ...current,
      group_configs: current.group_configs.map((group, groupIndex) => groupIndex === index ? { ...group, ...patch } : group),
    }))
  }

  const removeGroup = (index: number) => {
    setDraft((current) => ({
      ...current,
      group_configs: current.group_configs.filter((_, groupIndex) => groupIndex !== index),
    }))
  }

  const copyWebhook = async () => {
    const path = activeChannel?.webhook_path || ""
    if (!path) {
      return
    }
    const url = path.startsWith("http") ? path : `${window.location.origin}${path}`
    await navigator.clipboard.writeText(url)
    success(copy.copied)
  }

  if (settings && !settings.enabled) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{copy.title}</h1>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{copy.disabled}</CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <Button className="gap-2" onClick={startCreate}>
          <Plus size={16} />
          {copy.newChannel}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{copy.channelList}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {channels.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{copy.empty}</div>
            ) : (
              channels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  className={cn(
                    "w-full rounded-md border p-3 text-left text-sm transition-colors hover:bg-muted/50",
                    activeID === channel.id && "border-primary bg-primary/5"
                  )}
                  onClick={() => setActiveID(channel.id)}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare size={15} className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{channel.name}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{channel.provider}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{channel.enabled ? copy.enabled : copy.disabledState}</div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">{draft.id ? copy.editChannel : copy.newChannel}</CardTitle>
              <div className="flex flex-wrap gap-2">
                {draft.id && (
                  <>
                    <Button variant="outline" className="gap-2" onClick={() => toggleChannel.mutate()} disabled={toggleChannel.isPending}>
                      <Power size={16} />
                      {draft.enabled ? copy.disableChannel : copy.enableChannel}
                    </Button>
                    <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => deleteChannel.mutate(draft.id!)} disabled={deleteChannel.isPending}>
                      <Trash2 size={16} />
                      {copy.delete}
                    </Button>
                  </>
                )}
                <Button className="gap-2" onClick={() => saveChannel.mutate()} disabled={saveChannel.isPending}>
                  <Save size={16} />
                  {saveChannel.isPending ? copy.saving : copy.save}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={copy.name}>
                <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
              </Field>
              <Field label={copy.provider}>
                <Select value={String((draft.provider) || "__shadcn_empty__")} onValueChange={(value) => {
                    const provider = (value === "__shadcn_empty__" ? "" : value) as Draft["provider"]
                    setDraft((current) => ({ ...current, provider, bot_token: providerUsesBotToken(provider) ? current.bot_token : "" }))
                  }}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  {providerOptions.map((provider) => <SelectItem key={provider.value} value={String(provider.value)}>{provider.label}</SelectItem>)}
                </SelectContent></Select>
              </Field>
              {providerUsesBotToken(draft.provider) && (
                <Field label={copy.botToken}>
                  <Input
                    type="password"
                    value={draft.bot_token}
                    placeholder={activeChannel?.bot_token_preview || copy.botTokenPlaceholder}
                    onChange={(event) => setDraft((current) => ({ ...current, bot_token: event.target.value }))}
                  />
                </Field>
              )}
              {draft.provider === "qq" && (
                <>
                  <Field label={copy.qqConnectionMode}>
                    <Select value={String((qqConnectionMode) || "__shadcn_empty__")} onValueChange={(value) => updateProviderConfig("connection_mode", (value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                      <SelectItem value="webhook">{copy.qqConnectionWebhook}</SelectItem>
                      <SelectItem value="websocket">{copy.qqConnectionWebSocket}</SelectItem>
                    </SelectContent></Select>
                  </Field>
                  <Field label={copy.qqBotID}>
                    <Input value={providerConfig.bot_id || ""} placeholder="1020..." onChange={(event) => updateProviderConfig("bot_id", event.target.value)} />
                  </Field>
                  <Field label={copy.qqBotSecret}>
                    <Input type="password" value={providerConfig.bot_secret || ""} placeholder={copy.qqBotSecretPlaceholder} onChange={(event) => updateProviderConfig("bot_secret", event.target.value)} />
                  </Field>
                  <Field label={copy.qqBaseURL}>
                    <Input value={providerConfig.base_url || ""} placeholder="https://api.sgroup.qq.com" onChange={(event) => updateProviderConfig("base_url", event.target.value)} />
                  </Field>
                  <Field label={copy.qqTokenURL}>
                    <Input value={providerConfig.token_url || ""} placeholder="https://bots.qq.com/app/getAppAccessToken" onChange={(event) => updateProviderConfig("token_url", event.target.value)} />
                  </Field>
                  <QQIntentsPicker copy={copy} value={providerConfig.intents || ""} onChange={(value) => updateProviderConfig("intents", value)} />
                  <Field label={copy.qqShard}>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={providerConfig.shard_index || ""} placeholder="0" onChange={(event) => updateProviderConfig("shard_index", event.target.value)} />
                      <Input value={providerConfig.shard_total || ""} placeholder="1" onChange={(event) => updateProviderConfig("shard_total", event.target.value)} />
                    </div>
                  </Field>
                  <Field label={copy.qqMsgType}>
                    <Select value={String((providerConfig.msg_type || "2") || "__shadcn_empty__")} onValueChange={(value) => updateProviderConfig("msg_type", (value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                      <SelectItem value="0">{copy.qqMsgTypeText}</SelectItem>
                      <SelectItem value="2">{copy.qqMsgTypeMarkdown}</SelectItem>
                    </SelectContent></Select>
                  </Field>
                </>
              )}
              <Field label={copy.status}>
                <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
                  <Switch checked={draft.enabled} onCheckedChange={(checked) => setDraft((current) => ({ ...current, enabled: checked }))} />
                  {draft.enabled ? copy.enabled : copy.disabledState}
                </label>
              </Field>
            </div>

            {activeChannel?.webhook_path && !(draft.provider === "qq" && qqConnectionMode === "websocket") && (
              <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm md:grid-cols-[120px_minmax(0,1fr)_auto] md:items-center">
                <div className="font-medium">{copy.webhook}</div>
                <div className="min-w-0 break-all rounded bg-background p-2 font-mono text-xs">{`${window.location.origin}${activeChannel.webhook_path}`}</div>
                <Button variant="outline" size="sm" className="gap-2" onClick={copyWebhook}>
                  <Copy size={15} />
                  {copy.copy}
                </Button>
              </div>
            )}

            <section className="space-y-4">
              <h2 className="text-sm font-semibold">{copy.defaultConfig}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField label={copy.device} value={draft.default_device_id} onChange={(value) => setDraft((current) => ({ ...current, default_device_id: value }))}>
                  <option value="">{copy.inheritNone}</option>
                  {devices.map((device) => <option key={device.id} value={device.id}>{device.name}{device.online ? "" : ` (${copy.offline})`}</option>)}
                </SelectField>
                <SelectField label={copy.userChannel} value={draft.default_user_channel_id} onChange={(value) => setDraft((current) => ({ ...current, default_user_channel_id: value, default_model: "" }))}>
                  <option value="">{copy.inheritNone}</option>
                  {catalog.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
                </SelectField>
                <SelectField label={copy.model} value={draft.default_model} onChange={(value) => setDraft((current) => ({ ...current, default_model: value }))}>
                  <option value="">{copy.inheritNone}</option>
                  {defaultModelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                </SelectField>
                <SelectField label={copy.agent} value={draft.default_agent_id} onChange={(value) => setDraft((current) => ({ ...current, default_agent_id: value }))}>
                  <option value="">{copy.inheritNone}</option>
                  {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                </SelectField>
                <SelectField label={copy.replyMode} value={draft.reply_mode} onChange={(value) => setDraft((current) => ({ ...current, reply_mode: value }))}>
                  <option value="mention">{copy.modeMention}</option>
                  <option value="always">{copy.modeAlways}</option>
                  <option value="manual">{copy.modeManual}</option>
                </SelectField>
                <SelectField label={copy.triggerMode} value={draft.trigger_mode} onChange={(value) => setDraft((current) => ({ ...current, trigger_mode: value }))}>
                  <option value="mention">{copy.modeMention}</option>
                  <option value="direct">{copy.modeDirect}</option>
                  <option value="command">{copy.modeCommand}</option>
                </SelectField>
                <Field label={copy.contextCount}>
                  <Input type="number" min={0} max={100} value={draft.default_context_message_count} onChange={(event) => setDraft((current) => ({ ...current, default_context_message_count: event.target.value }))} />
                </Field>
                <SkillPicker label={copy.skills} skills={skills} selected={draft.default_skill_ids} onChange={(ids) => setDraft((current) => ({ ...current, default_skill_ids: ids }))} />
              </div>
              <Field label={copy.systemPrompt}>
                <textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={draft.system_prompt} onChange={(event) => setDraft((current) => ({ ...current, system_prompt: event.target.value }))} />
              </Field>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">{copy.groupConfigs}</h2>
                <Button variant="outline" size="sm" className="gap-2" onClick={addGroup}>
                  <Plus size={15} />
                  {copy.addGroup}
                </Button>
              </div>
              {draft.group_configs.length === 0 ? (
                <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{copy.noGroups}</div>
              ) : (
                <div className="space-y-3">
                  {draft.group_configs.map((group, index) => (
                    <div key={index} className="space-y-4 rounded-md border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">{group.name || group.external_id || `${copy.group} #${index + 1}`}</div>
                        <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeGroup(index)} aria-label={copy.delete}>
                          <Trash2 size={15} />
                        </Button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label={copy.externalGroupID}>
                          <Input value={group.external_id} onChange={(event) => updateGroup(index, { external_id: event.target.value })} />
                        </Field>
                        <Field label={copy.groupName}>
                          <Input value={group.name} onChange={(event) => updateGroup(index, { name: event.target.value })} />
                        </Field>
                        <SelectField label={copy.device} value={group.device_id} onChange={(value) => updateGroup(index, { device_id: value })}>
                          <option value="">{copy.inheritDefault}</option>
                          {devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
                        </SelectField>
                        <SelectField label={copy.userChannel} value={group.user_channel_id ? String(group.user_channel_id) : ""} onChange={(value) => updateGroup(index, { user_channel_id: value ? Number(value) : null })}>
                          <option value="">{copy.inheritDefault}</option>
                          {catalog.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
                        </SelectField>
                        <SelectField label={copy.model} value={group.model} onChange={(value) => updateGroup(index, { model: value })}>
                          <option value="">{copy.inheritDefault}</option>
                          {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                        </SelectField>
                        <SelectField label={copy.agent} value={group.agent_id ? String(group.agent_id) : ""} onChange={(value) => updateGroup(index, { agent_id: value ? Number(value) : null })}>
                          <option value="">{copy.inheritDefault}</option>
                          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                        </SelectField>
                        <Field label={copy.contextCount}>
                          <Input type="number" min={0} max={100} value={group.context_message_count} onChange={(event) => updateGroup(index, { context_message_count: Number(event.target.value) || 0 })} />
                        </Field>
                        <label className="flex h-10 items-center gap-2 self-end rounded-md border px-3 text-sm">
                          <Switch checked={group.enabled} onCheckedChange={(checked) => updateGroup(index, { enabled: checked })} />
                          {group.enabled ? copy.enabled : copy.disabledState}
                        </label>
                        <SkillPicker label={copy.skills} skills={skills} selected={group.skill_ids} onChange={(ids) => updateGroup(index, { skill_ids: ids })} />
                      </div>
                      <Field label={copy.systemPromptOverride}>
                        <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={group.system_prompt_override} onChange={(event) => updateGroup(index, { system_prompt_override: event.target.value })} />
                      </Field>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <Field label={label}>
      <Select value={String((value) || "__shadcn_empty__")} onValueChange={(value) => onChange((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
        {children}
      </SelectContent></Select>
    </Field>
  )
}

function SkillPicker({ label, skills, selected, onChange }: { label: string; skills: Skill[]; selected: number[]; onChange: (ids: number[]) => void }) {
  return (
    <div className="space-y-2 text-sm md:col-span-2">
      <div className="font-medium">{label}</div>
      <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
        {skills.length === 0 ? (
          <div className="text-sm text-muted-foreground">-</div>
        ) : (
          skills.map((skill) => (
            <label key={skill.id} className="flex items-center gap-2 text-sm">
              <Switch
                checked={selected.includes(skill.id)}
                onCheckedChange={(checked) => {
                  onChange(checked ? [...selected, skill.id] : selected.filter((id) => id !== skill.id))
                }}
              />
              <span className="truncate">{skill.name}</span>
            </label>
          ))
        )}
      </div>
    </div>
  )
}

function QQIntentsPicker({ copy, value, onChange }: { copy: typeof zhCopy; value: string; onChange: (value: string) => void }) {
  const selected = parseQQIntentValue(value)
  const toggle = (bit: number, checked: boolean) => {
    const next = checked ? selected | bit : selected & ~bit
    onChange(String(next || defaultQQIntentValue))
  }
  return (
    <div className="space-y-2 text-sm md:col-span-2">
      <div className="font-medium">{copy.qqIntents}</div>
      <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
        {qqIntentOptions.map((option) => (
          <label key={option.bit} className="flex items-center gap-2 text-sm">
            <Switch checked={(selected & option.bit) === option.bit} onCheckedChange={(checked) => toggle(option.bit, checked)} />
            <span className="min-w-0 flex-1 truncate">{copy[option.labelKey]}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{option.bit}</span>
          </label>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">{copy.qqIntentsValue}: {selected}</div>
    </div>
  )
}

function draftToPayload(draft: Draft) {
  return {
    name: draft.name.trim(),
    provider: draft.provider,
    bot_token: providerUsesBotToken(draft.provider) ? draft.bot_token.trim() || undefined : undefined,
    enabled: draft.enabled,
    default_device_id: draft.default_device_id,
    default_user_channel_id: draft.default_user_channel_id ? Number(draft.default_user_channel_id) : null,
    default_model: draft.default_model,
    default_agent_id: draft.default_agent_id ? Number(draft.default_agent_id) : null,
    default_skill_ids: draft.default_skill_ids,
    default_context_message_count: Number(draft.default_context_message_count) || 0,
    reply_mode: draft.reply_mode,
    trigger_mode: draft.trigger_mode,
    system_prompt: draft.system_prompt,
    group_configs: draft.group_configs,
    advanced_options: advancedOptionsForPayload(draft),
  }
}

function channelToDraft(channel: MessageChannel): Draft {
  return {
    id: channel.id,
    name: channel.name,
    provider: normalizeProviderValue(channel.provider),
    bot_token: "",
    enabled: channel.enabled,
    default_device_id: channel.default_device_id || "",
    default_user_channel_id: channel.default_user_channel_id ? String(channel.default_user_channel_id) : "",
    default_model: channel.default_model || "",
    default_agent_id: channel.default_agent_id ? String(channel.default_agent_id) : "",
    default_skill_ids: channel.default_skill_ids || [],
    default_context_message_count: String(channel.default_context_message_count || 12),
    reply_mode: channel.reply_mode || "mention",
    trigger_mode: channel.trigger_mode || "mention",
    system_prompt: channel.system_prompt || "",
    group_configs: channel.group_configs || [],
    advanced_options: { custom_provider_config_json: channel.advanced_options?.custom_provider_config_json || "" },
  }
}

function normalizeChannel(value: unknown): MessageChannel | null {
  if (!isRecord(value) || !Number(value.id)) {
    return null
  }
  return {
    id: Number(value.id),
    name: stringValue(value.name),
    provider: stringValue(value.provider) || "telegram",
    enabled: value.enabled !== false,
    bot_token_configured: value.bot_token_configured === true,
    bot_token_preview: stringValue(value.bot_token_preview),
    webhook_path: stringValue(value.webhook_path),
    default_device_id: stringValue(value.default_device_id),
    default_user_channel_id: nullableNumber(value.default_user_channel_id),
    default_model: stringValue(value.default_model),
    default_agent_id: nullableNumber(value.default_agent_id),
    default_skill_ids: numberArray(value.default_skill_ids),
    default_context_message_count: Number(value.default_context_message_count || 12),
    reply_mode: stringValue(value.reply_mode) || "mention",
    trigger_mode: stringValue(value.trigger_mode) || "mention",
    system_prompt: stringValue(value.system_prompt),
    group_configs: Array.isArray(value.group_configs) ? value.group_configs.map(normalizeGroup).filter(Boolean) as GroupConfig[] : [],
    advanced_options: normalizeAdvancedOptions(value.advanced_options),
    last_event_at: stringValue(value.last_event_at),
  }
}

function providerUsesBotToken(provider: string) {
  return provider === "telegram" || provider === "discord"
}

const defaultQQIntentValue = 513
const qqIntentOptions = [
  { bit: 1, labelKey: "qqIntentGuilds" },
  { bit: 512, labelKey: "qqIntentGuildMessages" },
  { bit: 4096, labelKey: "qqIntentDirectMessage" },
  { bit: 1 << 25, labelKey: "qqIntentGroupAndC2C" },
  { bit: 1 << 30, labelKey: "qqIntentPublicGuildMessages" },
] as const

function parseQQIntentValue(value: string) {
  const parsed = Number(value || defaultQQIntentValue)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultQQIntentValue
}

function advancedOptionsForPayload(draft: Draft): AdvancedOptions {
  if (draft.provider !== "qq") {
    return draft.advanced_options
  }
  const config = parseProviderConfig(draft.advanced_options.custom_provider_config_json)
  config.connection_mode = normalizeQQConnectionMode(config.connection_mode)
  return { ...draft.advanced_options, custom_provider_config_json: stringifyProviderConfig(config) }
}

function normalizeQQConnectionMode(value: unknown) {
  return stringValue(value).toLowerCase() === "websocket" || stringValue(value).toLowerCase() === "ws" ? "websocket" : "webhook"
}

function normalizeAdvancedOptions(value: unknown): AdvancedOptions {
  const item = isRecord(value) ? value : {}
  return { custom_provider_config_json: stringValue(item.custom_provider_config_json) }
}

function normalizeProviderValue(value: unknown): ChannelProvider {
  switch (stringValue(value).toLowerCase()) {
    case "discord":
      return "discord"
    case "qq":
    case "qq-official":
    case "qq_official":
      return "qq"
    case "onebot":
    case "one-bot":
    case "one_bot":
      return "onebot"
    default:
      return "telegram"
  }
}

function normalizeGroup(value: unknown): GroupConfig | null {
  if (!isRecord(value)) {
    return null
  }
  return {
    external_id: stringValue(value.external_id),
    name: stringValue(value.name),
    enabled: value.enabled !== false,
    device_id: stringValue(value.device_id),
    user_channel_id: nullableNumber(value.user_channel_id),
    model: stringValue(value.model),
    agent_id: nullableNumber(value.agent_id),
    skill_ids: numberArray(value.skill_ids),
    context_message_count: Number(value.context_message_count || 0),
    reply_mode: stringValue(value.reply_mode),
    trigger_mode: stringValue(value.trigger_mode),
    system_prompt_override: stringValue(value.system_prompt_override),
  }
}

function normalizeCatalogItem(value: unknown): UserChannelCatalog {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: stringValue(item.name),
    models: Array.isArray(item.models) ? item.models.filter((model): model is string => typeof model === "string") : [],
  }
}

function normalizeIDName(value: unknown): Agent | Skill | null {
  if (!isRecord(value) || !Number(value.id)) {
    return null
  }
  return { id: Number(value.id), name: stringValue(value.name) }
}

function normalizeDevice(value: unknown): Device | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringValue(value.id)
  if (!id) {
    return null
  }
  return { id, name: stringValue(value.name) || id, online: value.online === true }
}

function uniqueModels(catalog: UserChannelCatalog[]) {
  return Array.from(new Set(catalog.flatMap((channel) => channel.models))).sort()
}

function nullableNumber(value: unknown) {
  const next = Number(value || 0)
  return Number.isFinite(next) && next > 0 ? next : null
}

function numberArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0) : []
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseProviderConfig(raw: string): Record<string, string> {
  if (!raw.trim()) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return {}
    }
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, typeof value === "string" ? value : String(value ?? "")]))
  } catch {
    return {}
  }
}

function stringifyProviderConfig(config: Record<string, string>) {
  const cleaned = Object.fromEntries(Object.entries(config).filter(([, value]) => value.trim() !== ""))
  return Object.keys(cleaned).length ? JSON.stringify(cleaned, null, 2) : ""
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err) && isRecord(err.response) && isRecord(err.response.data) && typeof err.response.data.error === "string") {
    return err.response.data.error
  }
  return err instanceof Error ? err.message : fallback
}

const zhCopy = {
  title: "消息通道",
  subtitle: "把 Telegram 或 Discord 机器人接入 AI 平台，并按群配置模型、用户渠道、代理、skill、设备环境和上下文数量。",
  disabled: "管理员尚未启用消息通道。",
  channelList: "通道列表",
  empty: "暂无消息通道。",
  newChannel: "新建通道",
  editChannel: "编辑通道",
  defaultName: "Telegram 机器人",
  name: "名称",
  provider: "渠道",
  botToken: "Bot Token",
  botTokenPlaceholder: "输入机器人 token",
  qqBotID: "QQ 机器人 ID",
  qqBotSecret: "QQ 机器人 Secret",
  qqBotSecretPlaceholder: "输入 QQ 机器人 Secret",
  qqConnectionMode: "QQ 接入方式",
  qqConnectionWebhook: "Webhook",
  qqConnectionWebSocket: "WebSocket",
  qqBaseURL: "QQ 官方 API 地址",
  qqTokenURL: "QQ 调用凭证地址",
  qqIntents: "QQ 事件 Intents",
  qqIntentsValue: "当前值",
  qqIntentGuilds: "频道基础事件",
  qqIntentGuildMessages: "频道消息事件",
  qqIntentDirectMessage: "私信事件",
  qqIntentGroupAndC2C: "群聊与单聊事件",
  qqIntentPublicGuildMessages: "公域频道消息事件",
  qqShard: "QQ 分片",
  qqMsgType: "QQ 消息类型",
  qqMsgTypeText: "文本",
  qqMsgTypeMarkdown: "Markdown",
  status: "状态",
  enabled: "启用",
  disabledState: "停用",
  webhook: "Webhook",
  copy: "复制",
  copied: "已复制",
  defaultConfig: "默认配置",
  device: "设备开发环境",
  userChannel: "用户渠道",
  model: "模型",
  agent: "代理",
  skills: "Skills",
  contextCount: "上下文消息数量",
  replyMode: "回复模式",
  triggerMode: "触发模式",
  modeMention: "被提及时",
  modeAlways: "总是回复",
  modeManual: "手动",
  modeDirect: "私聊/直接消息",
  modeCommand: "命令触发",
  systemPrompt: "系统提示词",
  groupConfigs: "群/频道单独配置",
  addGroup: "添加群配置",
  noGroups: "暂无群级覆盖配置。",
  group: "群",
  groupName: "群名称",
  externalGroupID: "外部群/频道 ID",
  inheritNone: "不指定",
  inheritDefault: "继承默认",
  offline: "离线",
  systemPromptOverride: "群级提示词覆盖",
  save: "保存",
  saving: "保存中...",
  saved: "消息通道已保存",
  saveFailed: "保存消息通道失败",
  delete: "删除",
  deleted: "消息通道已删除",
  enabledSaved: "消息通道已启用",
  disabledSaved: "消息通道已禁用",
  enableChannel: "启用通道",
  disableChannel: "禁用通道",
  deleteFailed: "删除消息通道失败",
}

const enCopy: typeof zhCopy = {
  title: "Message Channels",
  subtitle: "Connect Telegram or Discord bots to the AI platform with per-group model, user channel, agent, skill, device, and context settings.",
  disabled: "Message Channels have not been enabled by an administrator.",
  channelList: "Channels",
  empty: "No message channels yet.",
  newChannel: "New Channel",
  editChannel: "Edit Channel",
  defaultName: "Telegram bot",
  name: "Name",
  provider: "Provider",
  botToken: "Bot Token",
  botTokenPlaceholder: "Enter bot token",
  qqBotID: "QQ bot ID",
  qqBotSecret: "QQ bot secret",
  qqBotSecretPlaceholder: "Enter QQ bot secret",
  qqConnectionMode: "QQ connection mode",
  qqConnectionWebhook: "Webhook",
  qqConnectionWebSocket: "WebSocket",
  qqBaseURL: "QQ Official API URL",
  qqTokenURL: "QQ access token URL",
  qqIntents: "QQ event intents",
  qqIntentsValue: "Current value",
  qqIntentGuilds: "Guild events",
  qqIntentGuildMessages: "Guild message events",
  qqIntentDirectMessage: "Direct messages",
  qqIntentGroupAndC2C: "Group and C2C events",
  qqIntentPublicGuildMessages: "Public guild messages",
  qqShard: "QQ shard",
  qqMsgType: "QQ message type",
  qqMsgTypeText: "Text",
  qqMsgTypeMarkdown: "Markdown",
  status: "Status",
  enabled: "Enabled",
  disabledState: "Disabled",
  webhook: "Webhook",
  copy: "Copy",
  copied: "Copied",
  defaultConfig: "Default configuration",
  device: "Device environment",
  userChannel: "User channel",
  model: "Model",
  agent: "Agent",
  skills: "Skills",
  contextCount: "Context messages",
  replyMode: "Reply mode",
  triggerMode: "Trigger mode",
  modeMention: "On mention",
  modeAlways: "Always reply",
  modeManual: "Manual",
  modeDirect: "Direct messages",
  modeCommand: "Command",
  systemPrompt: "System prompt",
  groupConfigs: "Per-group configuration",
  addGroup: "Add group",
  noGroups: "No per-group overrides.",
  group: "Group",
  groupName: "Group name",
  externalGroupID: "External group/channel ID",
  inheritNone: "Not set",
  inheritDefault: "Use default",
  offline: "offline",
  systemPromptOverride: "Group prompt override",
  save: "Save",
  saving: "Saving...",
  saved: "Message channel saved",
  saveFailed: "Failed to save message channel",
  delete: "Delete",
  deleted: "Message channel deleted",
  enabledSaved: "Message channel enabled",
  disabledSaved: "Message channel disabled",
  enableChannel: "Enable channel",
  disableChannel: "Disable channel",
  deleteFailed: "Failed to delete message channel",
}
