import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Activity, AlertTriangle, Ban, ChevronLeft, ChevronRight, Pencil, Plus, RefreshCw, ShieldAlert, Trash2, Users } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"

interface RiskSettings {
  enabled: boolean
  threshold_formula: string
  decay_time_per_hour: number
  decay_spend_formula: string
  llm_model: string
}
interface RiskRule {
  id: number | string
  name: string
  source: "user_agent" | "input_text" | "output_text" | "llm_input" | "llm_output"
  match_type: "contains" | "regex" | "llm"
  pattern: string
  mode: "block" | "score"
  risk_points: number
  llm_model: string
  enabled: boolean
  priority: number
}
interface RiskUser {
  user_id: number | string
  username: string
  email: string
  group_id?: number | string
  group_name?: string
  risk_score: number
  threshold: number
  banned: boolean
  banned_at?: string | null
  reason?: string | null
}
interface RiskEvent {
  id: number | string
  user_id: number | string
  username: string
  rule_name: string
  source: string
  delta: number
  score_after: number
  threshold: number
  action: string
  created_at: string
}
const initialSettings: RiskSettings = {
  enabled: false,
  threshold_formula: "100",
  decay_time_per_hour: 0,
  decay_spend_formula: "0",
  llm_model: "",
}
const pageSize = 20
const sourceValues: RiskRule["source"][] = ["user_agent", "input_text", "output_text", "llm_input", "llm_output"]
const matchValues: RiskRule["match_type"][] = ["contains", "regex", "llm"]

export default function RiskManagement() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : language === "ja" ? jaCopy : enCopy
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [settingsDraft, setSettingsDraft] = useState<RiskSettings | null>(null)
  const [editingRule, setEditingRule] = useState<RiskRule | null>(null)
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [usersPage, setUsersPage] = useState(1)
  const [eventsPage, setEventsPage] = useState(1)

  const { data: settingsData, isLoading: settingsLoading } = useQuery<RiskSettings>({
    queryKey: ["risk-settings"],
    queryFn: async () => (await api.get("/risk/settings")).data,
  })
  const settings = settingsDraft ?? settingsData ?? initialSettings
  const { data: ruleData, isLoading: rulesLoading } = useQuery<{ rules: RiskRule[] }>({
    queryKey: ["risk-rules"],
    queryFn: async () => (await api.get("/risk/rules")).data,
  })
  const { data: userData, isLoading: usersLoading } = useQuery<{ users: RiskUser[]; total: number }>({
    queryKey: ["risk-users", usersPage],
    queryFn: async () => (await api.get("/risk/users", { params: { page: usersPage, page_size: pageSize } })).data,
  })
  const { data: eventData, isLoading: eventsLoading } = useQuery<{ events: RiskEvent[]; total: number }>({
    queryKey: ["risk-events", eventsPage],
    queryFn: async () => (await api.get("/risk/events", { params: { page: eventsPage, page_size: pageSize } })).data,
  })
  const { data: modelsResponse } = useQuery<unknown>({
    queryKey: ["admin-model-list"],
    queryFn: async () => (await api.get("/models")).data,
    retry: false,
  })
  const models = useMemo(() => extractModelNames(modelsResponse), [modelsResponse])
  const rules = ruleData?.rules ?? []
  const users = userData?.users ?? []
  const events = eventData?.events ?? []
  const visibleUsers = users.length > pageSize ? users.slice((usersPage - 1) * pageSize, usersPage * pageSize) : users
  const visibleEvents = events.length > pageSize ? events.slice((eventsPage - 1) * pageSize, eventsPage * pageSize) : events
  const usersTotal = userData?.total ?? users.length
  const eventsTotal = eventData?.total ?? events.length

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["risk-settings"] })
    void queryClient.invalidateQueries({ queryKey: ["risk-rules"] })
    void queryClient.invalidateQueries({ queryKey: ["risk-users"] })
    void queryClient.invalidateQueries({ queryKey: ["risk-events"] })
  }
  const saveSettings = useMutation({
    mutationFn: async (value: RiskSettings) => (await api.put("/risk/settings", value)).data,
    onSuccess: (value: RiskSettings | undefined) => {
      queryClient.setQueryData(["risk-settings"], value ?? settings)
      setSettingsDraft(null)
      success(copy.settingsSaved)
    },
    onError: () => error(copy.settingsFailed),
  })
  const saveRule = useMutation({
    mutationFn: async (rule: RiskRule) => rule.id ? api.put(`/risk/rules/${rule.id}`, rule) : api.post("/risk/rules", rule),
    onSuccess: () => {
      setRuleDialogOpen(false)
      setEditingRule(null)
      success(copy.ruleSaved)
      void queryClient.invalidateQueries({ queryKey: ["risk-rules"] })
    },
    onError: () => error(copy.ruleSaveFailed),
  })
  const deleteRule = useMutation({
    mutationFn: async (id: RiskRule["id"]) => api.delete(`/risk/rules/${id}`),
    onSuccess: () => { success(copy.ruleDeleted); void queryClient.invalidateQueries({ queryKey: ["risk-rules"] }) },
    onError: () => error(copy.ruleDeleteFailed),
  })
  const unban = useMutation({
    mutationFn: async (id: RiskUser["user_id"]) => api.post(`/risk/users/${id}/unban`),
    onSuccess: () => { success(copy.unbanned); void queryClient.invalidateQueries({ queryKey: ["risk-users"] }) },
    onError: () => error(copy.unbanFailed),
  })
  const openNewRule = () => { setEditingRule(emptyRule()); setRuleDialogOpen(true) }
  const openEditRule = (rule: RiskRule) => { setEditingRule({ ...rule }); setRuleDialogOpen(true) }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><ShieldAlert className="size-7 text-primary" />{copy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={refresh}><RefreshCw className="size-4" />{copy.refresh}</Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div><CardTitle>{copy.settingsTitle}</CardTitle><CardDescription className="mt-1">{copy.settingsDescription}</CardDescription></div>
          <div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">{settings.enabled ? copy.enabled : copy.disabled}</span><Switch checked={settings.enabled} disabled={settingsLoading} aria-label={copy.riskSwitch} onCheckedChange={(enabled) => setSettingsDraft({ ...settings, enabled })} /></div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={copy.thresholdFormula} hint={copy.thresholdHint}><Input value={settings.threshold_formula} onChange={(event) => setSettingsDraft({ ...settings, threshold_formula: event.target.value })} placeholder="100 + total_spend * 0.1" /></Field>
            <Field label={copy.timeDecay} hint={copy.timeDecayHint}><Input type="number" min="0" step="0.01" value={settings.decay_time_per_hour} onChange={(event) => setSettingsDraft({ ...settings, decay_time_per_hour: Number(event.target.value) })} /></Field>
            <Field label={copy.spendDecay} hint={copy.spendDecayHint}><Input value={settings.decay_spend_formula} onChange={(event) => setSettingsDraft({ ...settings, decay_spend_formula: event.target.value })} placeholder="tokens / 1000 * 0.5" /></Field>
            <Field label={copy.defaultLlmModel} hint={copy.defaultLlmHint}><ModelInput value={settings.llm_model} models={models} onChange={(llm_model) => setSettingsDraft({ ...settings, llm_model })} placeholder="model-name" /></Field>
          </div>
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="mb-2 flex items-center gap-2 font-medium"><AlertTriangle className="size-4 text-amber-500" />{copy.variablesTitle}</div>
            <p className="text-muted-foreground">{copy.variablesDescription}</p>
            <div className="mt-3 flex flex-wrap gap-2">{[["total_spend", copy.totalSpend], ["total_recharge", copy.totalRecharge], ["group_id", copy.groupID], ["risk_score", copy.riskScoreVariable], ["tokens", copy.tokens], ["input_tokens", copy.inputTokens], ["output_tokens", copy.outputTokens]].map(([variable, label]) => <code key={variable} className="rounded bg-background px-2 py-1 text-xs">{variable} · {label}</code>)}</div>
            <p className="mt-3 text-xs text-muted-foreground">{copy.safetyNote}</p>
          </div>
          <div className="flex justify-end"><Button disabled={saveSettings.isPending || settingsLoading} onClick={() => saveSettings.mutate(settings)}>{saveSettings.isPending ? copy.saving : copy.saveSettings}</Button></div>
        </CardContent>
      </Card>

      <Tabs defaultValue="rules" className="space-y-4">
        <TabsList className="w-full justify-start sm:w-fit">
          <TabsTrigger value="rules" className="gap-2"><ShieldAlert className="size-4" />{copy.rulesTab}</TabsTrigger>
          <TabsTrigger value="users" className="gap-2"><Users className="size-4" />{copy.usersTab}<span className="rounded-full bg-muted px-1.5 text-xs">{usersTotal}</span></TabsTrigger>
          <TabsTrigger value="events" className="gap-2"><Activity className="size-4" />{copy.eventsTab}</TabsTrigger>
        </TabsList>
        <TabsContent value="rules">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardTitle>{copy.rulesTitle}</CardTitle><CardDescription className="mt-1">{copy.rulesDescription}</CardDescription></div><Button className="gap-2" onClick={openNewRule}><Plus className="size-4" />{copy.addRule}</Button></CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>{copy.name}</TableHead><TableHead>{copy.source}</TableHead><TableHead>{copy.matchType}</TableHead><TableHead>{copy.patternOrModel}</TableHead><TableHead>{copy.action}</TableHead><TableHead>{copy.riskPoints}</TableHead><TableHead>{copy.status}</TableHead><TableHead className="text-right">{copy.actions}</TableHead></TableRow></TableHeader>
                <TableBody>{rulesLoading ? <EmptyRow columns={8}>{copy.loading}</EmptyRow> : rules.length === 0 ? <EmptyRow columns={8}>{copy.noRules}</EmptyRow> : [...rules].sort((a, b) => a.priority - b.priority).map((rule) => <TableRow key={rule.id}>
                  <TableCell className="min-w-32 font-medium">{rule.name}<div className="text-xs text-muted-foreground">{copy.priority}: {rule.priority}</div></TableCell>
                  <TableCell className="whitespace-nowrap">{sourceLabel(rule.source, copy)}</TableCell>
                  <TableCell>{matchLabel(rule.match_type, copy)}</TableCell>
                  <TableCell className="max-w-64 truncate font-mono text-xs" title={rule.match_type === "llm" ? rule.llm_model : rule.pattern}>{rule.match_type === "llm" ? rule.llm_model || "-" : rule.pattern || "-"}</TableCell>
                  <TableCell><span className={rule.mode === "block" ? "rounded-full bg-red-500/10 px-2 py-1 text-xs text-red-600 dark:text-red-300" : "rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300"}>{rule.mode === "block" ? copy.block : copy.score}</span></TableCell>
                  <TableCell>{rule.mode === "score" ? rule.risk_points : "—"}</TableCell><TableCell><span className={rule.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>{rule.enabled ? copy.enabled : copy.disabled}</span></TableCell>
                  <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title={copy.edit} onClick={() => openEditRule(rule)}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" title={copy.delete} disabled={deleteRule.isPending} onClick={async () => { if (await confirm({ title: copy.deleteRule, description: copy.deleteRuleConfirm, destructive: true })) deleteRule.mutate(rule.id) }}><Trash2 className="size-4 text-destructive" /></Button></div></TableCell>
                </TableRow>)}</TableBody></Table></div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="users">
          <Card>
            <CardHeader><CardTitle>{copy.usersTitle}</CardTitle><CardDescription>{copy.usersDescription}</CardDescription></CardHeader>
            <CardContent><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>{copy.user}</TableHead><TableHead>{copy.group}</TableHead><TableHead>{copy.riskScore}</TableHead><TableHead>{copy.threshold}</TableHead><TableHead>{copy.bannedAt}</TableHead><TableHead>{copy.reason}</TableHead><TableHead className="text-right">{copy.actions}</TableHead></TableRow></TableHeader><TableBody>
              {usersLoading ? <EmptyRow columns={7}>{copy.loading}</EmptyRow> : visibleUsers.length === 0 ? <EmptyRow columns={7}>{copy.noBannedUsers}</EmptyRow> : visibleUsers.map((user) => <TableRow key={user.user_id}><TableCell className="min-w-40"><div className="font-medium">{user.username || `#${user.user_id}`}</div><div className="text-xs text-muted-foreground">{user.email || `ID ${user.user_id}`}</div></TableCell><TableCell>{user.group_name || (user.group_id ? `#${user.group_id}` : "—")}</TableCell><TableCell className="font-mono">{formatNumber(user.risk_score)}</TableCell><TableCell className="font-mono">{formatNumber(user.threshold)}</TableCell><TableCell className="whitespace-nowrap text-xs">{formatDate(user.banned_at)}</TableCell><TableCell className="max-w-64 truncate text-sm" title={user.reason || ""}>{user.reason || "—"}</TableCell><TableCell className="text-right">{user.banned ? <Button variant="outline" size="sm" className="gap-1.5" disabled={unban.isPending} onClick={() => unban.mutate(user.user_id)}><Ban className="size-3.5" />{copy.unban}</Button> : <span className="text-xs text-muted-foreground">{copy.notBanned}</span>}</TableCell></TableRow>)}
            </TableBody></Table></div><Pagination page={usersPage} pageSize={pageSize} total={usersTotal} onPage={setUsersPage} copy={copy} /></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="events">
          <Card>
            <CardHeader><CardTitle>{copy.eventsTitle}</CardTitle><CardDescription>{copy.eventsDescription}</CardDescription></CardHeader>
            <CardContent><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>{copy.time}</TableHead><TableHead>{copy.user}</TableHead><TableHead>{copy.rule}</TableHead><TableHead>{copy.source}</TableHead><TableHead>{copy.delta}</TableHead><TableHead>{copy.scoreAfter}</TableHead><TableHead>{copy.threshold}</TableHead><TableHead>{copy.action}</TableHead></TableRow></TableHeader><TableBody>
              {eventsLoading ? <EmptyRow columns={8}>{copy.loading}</EmptyRow> : visibleEvents.length === 0 ? <EmptyRow columns={8}>{copy.noEvents}</EmptyRow> : visibleEvents.map((event) => <TableRow key={event.id}><TableCell className="whitespace-nowrap text-xs">{formatDate(event.created_at)}</TableCell><TableCell>{event.username || `#${event.user_id}`}</TableCell><TableCell>{event.rule_name || "—"}</TableCell><TableCell>{sourceLabel(event.source as RiskRule["source"], copy)}</TableCell><TableCell className={event.delta < 0 ? "font-mono text-emerald-600" : "font-mono"}>{event.delta > 0 ? "+" : ""}{formatNumber(event.delta)}</TableCell><TableCell className="font-mono">{formatNumber(event.score_after)}</TableCell><TableCell className="font-mono">{formatNumber(event.threshold)}</TableCell><TableCell><span className="rounded-full bg-muted px-2 py-1 text-xs">{event.action || "—"}</span></TableCell></TableRow>)}
            </TableBody></Table></div><Pagination page={eventsPage} pageSize={pageSize} total={eventsTotal} onPage={setEventsPage} copy={copy} /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RuleEditorDialog open={ruleDialogOpen} rule={editingRule} models={models} copy={copy} saving={saveRule.isPending} onOpenChange={(open) => { setRuleDialogOpen(open); if (!open) setEditingRule(null) }} onChange={setEditingRule} onSave={() => editingRule && saveRule.mutate(editingRule)} />
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
}
function ModelInput({ value, models, onChange, placeholder }: { value: string; models: string[]; onChange: (value: string) => void; placeholder: string }) {
  return <><Input list="risk-model-options" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><datalist id="risk-model-options">{models.map((model) => <option key={model} value={model} />)}</datalist></>
}
function RuleEditorDialog({ open, rule, models, copy, saving, onOpenChange, onChange, onSave }: { open: boolean; rule: RiskRule | null; models: string[]; copy: Copy; saving: boolean; onOpenChange: (open: boolean) => void; onChange: (rule: RiskRule | null) => void; onSave: () => void }) {
  const set = <K extends keyof RiskRule>(key: K, value: RiskRule[K]) => onChange(rule ? { ...rule, [key]: value } : null)
  const needsPattern = rule?.match_type !== "llm"
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{rule?.id ? copy.editRule : copy.addRule}</DialogTitle></DialogHeader>{rule && <div className="grid gap-4 sm:grid-cols-2">
    <Field label={copy.name}><Input value={rule.name} onChange={(event) => set("name", event.target.value)} autoFocus /></Field>
    <Field label={copy.priority}><Input type="number" value={rule.priority} onChange={(event) => set("priority", Number(event.target.value))} /></Field>
    <Field label={copy.source}><Select value={rule.source} onValueChange={(value) => { const source = value as RiskRule["source"]; const isLLM = source === "llm_input" || source === "llm_output"; onChange({ ...rule, source, match_type: isLLM ? "llm" : rule.match_type === "llm" ? "contains" : rule.match_type, mode: isLLM ? "score" : rule.mode }) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{sourceValues.map((value) => <SelectItem key={value} value={value}>{sourceLabel(value, copy)}</SelectItem>)}</SelectContent></Select></Field>
    <Field label={copy.matchType}><Select value={rule.match_type} onValueChange={(value) => { const type = value as RiskRule["match_type"]; onChange({ ...rule, match_type: type, mode: type === "llm" ? "score" : rule.mode }) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{matchValues.map((value) => <SelectItem key={value} value={value}>{matchLabel(value, copy)}</SelectItem>)}</SelectContent></Select></Field>
    {needsPattern ? <Field label={copy.pattern}><Textarea className="min-h-24" value={rule.pattern} onChange={(event) => set("pattern", event.target.value)} placeholder={rule.match_type === "regex" ? "(?i)pattern" : copy.patternPlaceholder} /></Field> : <Field label={copy.llmModel}><ModelInput value={rule.llm_model} models={models} onChange={(value) => set("llm_model", value)} placeholder="model-name" /></Field>}
    <Field label={copy.mode}><Select value={rule.mode} disabled={rule.match_type === "llm"} onValueChange={(value) => set("mode", value as RiskRule["mode"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{rule.match_type === "llm" ? <SelectItem value="score">{copy.score}</SelectItem> : <><SelectItem value="block">{copy.block}</SelectItem><SelectItem value="score">{copy.score}</SelectItem></>}</SelectContent></Select></Field>
    {rule.mode === "score" && <Field label={copy.riskPoints}><Input type="number" step="0.1" value={rule.risk_points} onChange={(event) => set("risk_points", Number(event.target.value))} /></Field>}
    {rule.match_type === "llm" && <Field label={copy.llmPrompt}><Textarea className="min-h-24" value={rule.pattern} onChange={(event) => set("pattern", event.target.value)} placeholder={copy.llmPromptHint} /></Field>}
    <div className="flex items-center gap-2 sm:col-span-2"><Checkbox checked={rule.enabled} onCheckedChange={(checked) => set("enabled", checked === true)} id="risk-rule-enabled" /><Label htmlFor="risk-rule-enabled">{copy.enabled}</Label></div>
    <p className="text-xs text-muted-foreground sm:col-span-2">{copy.ruleModeHint}</p>
  </div>}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{copy.cancel}</Button><Button disabled={!rule?.name.trim() || saving} onClick={onSave}>{saving ? copy.saving : copy.save}</Button></DialogFooter></DialogContent></Dialog>
}
function EmptyRow({ columns, children }: { columns: number; children: React.ReactNode }) { return <TableRow><TableCell colSpan={columns} className="py-10 text-center text-sm text-muted-foreground">{children}</TableCell></TableRow> }
function Pagination({ page, pageSize: size, total, onPage, copy }: { page: number; pageSize: number; total: number; onPage: (page: number) => void; copy: Copy }) {
  const pages = Math.max(1, Math.ceil(total / size))
  return <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground"><span>{copy.total.replace("{total}", String(total))}</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" aria-label={copy.previous} disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}><ChevronLeft className="size-4" />{copy.previous}</Button><span>{page} / {pages}</span><Button variant="outline" size="sm" aria-label={copy.next} disabled={page >= pages} onClick={() => onPage(Math.min(pages, page + 1))}>{copy.next}<ChevronRight className="size-4" /></Button></div></div>
}
function emptyRule(): RiskRule { return { id: "", name: "", source: "input_text", match_type: "contains", pattern: "", mode: "score", risk_points: 10, llm_model: "", enabled: true, priority: 100 } }
function extractModelNames(value: unknown): string[] {
  const root = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const candidates = Array.isArray(value) ? value : Array.isArray(root.models) ? root.models : Array.isArray(root.data) ? root.data : []
  return candidates.map((item) => {
    if (typeof item === "string") return item
    if (!item || typeof item !== "object") return ""
    const model = item as Record<string, unknown>
    return String(model.id ?? model.name ?? model.model_name ?? "")
  }).filter(Boolean)
}
function sourceLabel(source: RiskRule["source"], copy: Copy) { return ({ user_agent: copy.userAgent, input_text: copy.inputText, output_text: copy.outputText, llm_input: copy.llmInput, llm_output: copy.llmOutput } as Record<string, string>)[source] || source }
function matchLabel(type: RiskRule["match_type"], copy: Copy) { return ({ contains: copy.contains, regex: copy.regex, llm: copy.llmJudge } as Record<string, string>)[type] || type }
function formatNumber(value: number) { return Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0" }
function formatDate(value?: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString() }

type Copy = typeof zhCopy
const zhCopy = {
  title: "风控管理", subtitle: "配置内容检测规则、风险评分与用户 API 风控处置。", refresh: "刷新", settingsTitle: "全局风控设置", settingsDescription: "风险分异步累计；达到用户阈值后可冻结 API。LLM 判定仅在规则启用后异步执行。", enabled: "已启用", disabled: "已停用", riskSwitch: "启用风控", thresholdFormula: "风险阈值公式", thresholdHint: "用户风险分达到此公式结果时触发风控。", timeDecay: "每小时时间衰减分", timeDecayHint: "风险分按小时衰减，最低为 0。", spendDecay: "消费 / Token 衰减公式", spendDecayHint: "定义随消费或 Token 使用抵扣风险分的公式。", defaultLlmModel: "默认 LLM 模型（可选）", defaultLlmHint: "供未单独指定模型的异步 LLM 规则参考。", variablesTitle: "可用公式变量", variablesDescription: "阈值和衰减公式可使用用户累计数据、用户组及当前请求数据；支持 +、-、*、/、比较、min/max/abs 和 choose(条件, 值1, 值2)，按 group_id 编写用户组条件：", safetyNote: "同步规则可在输入或输出侧阻断；流式输出阻断需要后端完整缓冲。异步 LLM 规则会把截断后的文本发送到所选上游模型；风控事件不保存原始请求或响应。", saveSettings: "保存设置", saving: "保存中…", settingsSaved: "风控设置已保存", settingsFailed: "保存风控设置失败", rulesTab: "规则", usersTab: "风控用户", eventsTab: "命中日志", rulesTitle: "事件规则", rulesDescription: "按优先级检查 User-Agent、输入 / 输出文本，并可选择异步 LLM 判定。", addRule: "新增规则", name: "名称", source: "事件源", matchType: "匹配方式", patternOrModel: "匹配内容 / LLM 模型", action: "动作", riskPoints: "风险分", status: "状态", actions: "操作", priority: "优先级", edit: "编辑", delete: "删除", block: "同步阻断", score: "异步加分", userAgent: "User-Agent", inputText: "输入文本", outputText: "输出文本", llmInput: "LLM 输入判定", llmOutput: "LLM 输出判定", contains: "关键词包含", regex: "正则表达式", llmJudge: "异步 LLM", noRules: "暂无规则，添加一条规则开始配置。", loading: "加载中…", ruleSaved: "规则已保存", ruleSaveFailed: "保存规则失败", ruleDeleted: "规则已删除", ruleDeleteFailed: "删除规则失败", deleteRule: "删除规则", deleteRuleConfirm: "确定删除这条风控规则？", addRuleTitle: "新增规则", editRule: "编辑规则", save: "保存", cancel: "取消", pattern: "匹配内容 / 正则", patternPlaceholder: "输入要匹配的关键词或短语", llmModel: "LLM 模型", llmPrompt: "LLM 判断提示词 / 条件", llmPromptHint: "简要描述命中标准（可选）", mode: "处置动作", ruleModeHint: "LLM 判定按异步方式执行，不阻塞请求；同步阻断仅适用于关键词 / 正则规则。", usersTitle: "被风控用户", usersDescription: "查看风险分、触发阈值及冻结原因；可手动解除风控。", user: "用户", group: "用户组", riskScore: "风险分", threshold: "触发阈值", bannedAt: "封禁时间", reason: "风控原因", noBannedUsers: "当前没有被风控的用户。", unban: "手动解封", notBanned: "未封禁", unbanned: "已解除风控", unbanFailed: "解封失败", eventsTitle: "命中事件日志", eventsDescription: "异步记录规则命中、风险分变化和处置结果。", time: "时间", rule: "规则", delta: "分值变化", scoreAfter: "变化后风险分", noEvents: "暂无命中事件。", total: "共 {total} 条", previous: "上一页", next: "下一页", totalSpend: "累计消费", totalRecharge: "累计充值", groupID: "用户组 ID", groupName: "用户组名称", riskScoreVariable: "当前风险分", tokens: "Token", inputTokens: "输入 Token", outputTokens: "输出 Token",
}
const enCopy: Copy = {
  title: "Risk Management", subtitle: "Configure content checks, risk scoring and API restrictions.", refresh: "Refresh", settingsTitle: "Global risk settings", settingsDescription: "Risk points accumulate asynchronously. Reaching a user's threshold can freeze API access. LLM checks run asynchronously only when enabled.", enabled: "Enabled", disabled: "Disabled", riskSwitch: "Enable risk controls", thresholdFormula: "Risk threshold formula", thresholdHint: "Risk controls trigger when the user's score reaches this formula result.", timeDecay: "Time decay points per hour", timeDecayHint: "Risk points decay hourly and never fall below zero.", spendDecay: "Spend / token decay formula", spendDecayHint: "Formula for reducing risk points as spend or tokens accrue.", defaultLlmModel: "Default LLM model (optional)", defaultLlmHint: "Fallback reference for async LLM rules without a model override.", variablesTitle: "Available formula variables", variablesDescription: "Threshold and decay formulas can use user totals, group and current request values. Use arithmetic, comparisons, min/max/abs and choose(condition, a, b); use group_id for group-specific logic:", safetyNote: "Synchronous rules can block input or output. Blocking streaming output requires full buffering on the backend. Async LLM rules send clipped content to the selected upstream model; risk events do not store raw requests or responses.", saveSettings: "Save settings", saving: "Saving…", settingsSaved: "Risk settings saved", settingsFailed: "Could not save risk settings", rulesTab: "Rules", usersTab: "Risk users", eventsTab: "Hit log", rulesTitle: "Event rules", rulesDescription: "Check User-Agent and input / output text by priority, with optional asynchronous LLM checks.", addRule: "Add rule", name: "Name", source: "Event source", matchType: "Match type", patternOrModel: "Pattern / LLM model", action: "Action", riskPoints: "Risk points", status: "Status", actions: "Actions", priority: "Priority", edit: "Edit", delete: "Delete", block: "Synchronous block", score: "Async score", userAgent: "User-Agent", inputText: "Input text", outputText: "Output text", llmInput: "LLM input check", llmOutput: "LLM output check", contains: "Keyword contains", regex: "Regular expression", llmJudge: "Async LLM", noRules: "No rules yet. Add one to get started.", loading: "Loading…", ruleSaved: "Rule saved", ruleSaveFailed: "Could not save rule", ruleDeleted: "Rule deleted", ruleDeleteFailed: "Could not delete rule", deleteRule: "Delete rule", deleteRuleConfirm: "Delete this risk rule?", addRuleTitle: "Add rule", editRule: "Edit rule", save: "Save", cancel: "Cancel", pattern: "Pattern / regular expression", patternPlaceholder: "Enter matching keyword or phrase", llmModel: "LLM model", llmPrompt: "LLM criteria / prompt", llmPromptHint: "Briefly describe the match criteria (optional)", mode: "Action", ruleModeHint: "LLM checks run asynchronously and do not block requests; synchronous blocking is for keyword / regex rules.", usersTitle: "Risk-controlled users", usersDescription: "Review scores, thresholds and restriction reasons; manually restore API access.", user: "User", group: "Group", riskScore: "Risk score", threshold: "Threshold", bannedAt: "Restricted at", reason: "Reason", noBannedUsers: "No users are currently restricted.", unban: "Unban", notBanned: "Not banned", unbanned: "Risk restriction removed", unbanFailed: "Could not unban user", eventsTitle: "Risk hit events", eventsDescription: "Asynchronous record of rule hits, score changes and resulting actions.", time: "Time", rule: "Rule", delta: "Score change", scoreAfter: "Score after", noEvents: "No risk events yet.", total: "{total} total", previous: "Previous", next: "Next", totalSpend: "Total spend", totalRecharge: "Total recharge", groupID: "Group ID", groupName: "Group name", riskScoreVariable: "Current risk score", tokens: "Tokens", inputTokens: "Input tokens", outputTokens: "Output tokens",
}
const jaCopy: Copy = { ...enCopy, title: "リスク管理", subtitle: "コンテンツ検査、リスクスコアと API 制限を設定します。", settingsTitle: "全体設定", rulesTab: "ルール", usersTab: "対象ユーザー", eventsTab: "イベントログ", addRule: "ルールを追加", usersTitle: "リスク制限ユーザー", eventsTitle: "検知イベント", save: "保存", cancel: "キャンセル", refresh: "更新", unban: "解除" }
