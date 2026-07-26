import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, BriefcaseBusiness, CheckCircle2, CirclePause, ClipboardCheck, Loader2, Pencil, Plus, Play, RefreshCw, Save, ShieldCheck, Target, Trash2, UsersRound, XCircle } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { PageTab, PageTabs } from "@/components/layout/PageTabs"

type CompanyState = "draft" | "bootstrap" | "operating" | "attention_required" | "safe_mode" | "paused" | "archived"
type WorkStatus = "planned" | "owner_decision" | "authorized" | "queued" | "executing" | "awaiting_review" | "verified" | "delivered" | "blocked" | "retryable_failure" | "dead_letter" | "cancelled"

interface Company { id: number; name: string; state: CompanyState; timezone: string; autonomy_level: string; daily_budget: string | number; monthly_budget: string | number; max_concurrent_tasks?: number; agent_group_id?: string; connector_device_id?: string; connector_workspace_path?: string; connector_command_prefixes?: string }
interface Objective { id: number; title: string; description: string; status: string; priority: number; target_date?: string }
interface WorkItem { id: number; objective_id?: number; title: string; description: string; definition_of_done: string; status: WorkStatus; priority: number; risk_level: string; estimated_cost: string | number; due_at?: string }
interface Approval { id: number; work_item_id: number; risk_level: string; status: string; requested_action: string; expires_at?: string }
interface ConnectorApproval { id: string; work_item_id: number; work_item_title: string; run_id: string; action: string; workspace_path: string; payload: Record<string, unknown>; created_at: string }
interface InternalSession { readonly: true; session: { title: string; messages: { id: string; role: string; content: string; created_at?: string }[] }; run: { id: string; status: string; cost: string | number; created_at?: string }; attempt: { id: number; status: string } }
interface StudioMember { id: string; name: string; type: "chief" | "worker" | "critic" | "reviewer" | "checker"; prompt?: string; chat_agent_id?: string; default_model?: string; user_channel_id?: number; skill_ids?: string[]; mcp_server_ids?: string[] }
interface StudioDetail { id: string; name: string; description?: string; agents: StudioMember[] }
interface ChatAgent { id: string; name: string }
interface ConnectorDevice { id: string; name: string; online: boolean; status: string }
interface CompanyData {
  company: Company | null
  bootstrap_required?: boolean
  objectives?: Objective[]
  work_items?: WorkItem[]
  approvals?: Approval[]
	connector_approvals?: ConnectorApproval[]
  budget?: { daily_limit: string | number; monthly_limit: string | number; reserved: string | number; consumed: string | number; monthly_reserved: string | number }
  balance_guard?: { current: string | number; floor: string | number }
  health?: { active_objectives: number; active_work_items: number; blocked_work_items: number; pending_approvals: number }
}

const companyKey = (studioID: string) => ["personal-company", studioID] as const
const personalCompanyURL = (path: string, studioID: string) => `${path}${path.includes("?") ? "&" : "?"}studio_id=${encodeURIComponent(studioID)}`
const PersonalCompanyStudioContext = createContext("")
const tabs = ["概览", "目标", "工作", "审批", "团队", "运行环境", "调度"] as const
type Tab = typeof tabs[number]

export default function PersonalCompany() {
  const { groupID = "" } = useParams()
  const client = useQueryClient()
  const { success, error } = useToast()
  const [tab, setTab] = useState<Tab>("概览")
  const [companyName, setCompanyName] = useState("")
  const [mission, setMission] = useState("")
  const [balanceFloor, setBalanceFloor] = useState("0")
  const [objectiveTitle, setObjectiveTitle] = useState("")
  const [objectiveDescription, setObjectiveDescription] = useState("")
  const [workTitle, setWorkTitle] = useState("")
  const [workDescription, setWorkDescription] = useState("")
  const [definitionOfDone, setDefinitionOfDone] = useState("")
  const [isObjectiveDialogOpen, setIsObjectiveDialogOpen] = useState(false)
  const [isWorkDialogOpen, setIsWorkDialogOpen] = useState(false)
  const [internalWork, setInternalWork] = useState<WorkItem | null>(null)
  const balanceNoticeKey = useRef("")

  const companyQuery = useQuery<CompanyData>({ queryKey: companyKey(groupID), enabled: Boolean(groupID), refetchInterval: 10000, queryFn: async () => (await api.get(personalCompanyURL("/user/personal-company", groupID))).data })
  const refresh = () => void client.invalidateQueries({ queryKey: companyKey(groupID) })
  const bootstrap = useMutation({
    mutationFn: async () => api.post(personalCompanyURL("/user/personal-company/bootstrap", groupID), { name: companyName, mission, balance_floor: balanceFloor, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", autonomy_level: "r0" }),
    onSuccess: () => { success("工作室运营已启用"); refresh() }, onError: (value: unknown) => error(message(value, "启用失败")),
  })
  const changeState = useMutation({
    mutationFn: async (action: "pause" | "resume") => api.post(personalCompanyURL(`/user/personal-company/${action}`, groupID)),
    onSuccess: () => refresh(), onError: (value: unknown) => error(message(value, "更新状态失败")),
  })
  const createObjective = useMutation({
    mutationFn: async () => api.post(personalCompanyURL("/user/personal-company/objectives", groupID), { title: objectiveTitle, description: objectiveDescription }),
    onSuccess: () => { setObjectiveTitle(""); setObjectiveDescription(""); setIsObjectiveDialogOpen(false); success("目标已创建"); refresh() }, onError: (value: unknown) => error(message(value, "创建目标失败")),
  })
  const createWork = useMutation({
    mutationFn: async () => api.post(personalCompanyURL("/user/personal-company/work-items", groupID), { title: workTitle, description: workDescription, definition_of_done: definitionOfDone }),
    onSuccess: () => { setWorkTitle(""); setWorkDescription(""); setDefinitionOfDone(""); setIsWorkDialogOpen(false); success("工作已创建，正在安排内部会话"); refresh() }, onError: (value: unknown) => error(message(value, "创建工作失败")),
  })
  const decideApproval = useMutation({
    mutationFn: async ({ id, decision }: { id: number; decision: "approved" | "rejected" }) => api.post(personalCompanyURL(`/user/personal-company/approvals/${id}/decide`, groupID), { decision }),
    onSuccess: () => { success("审批已记录"); refresh() }, onError: (value: unknown) => error(message(value, "审批失败")),
  })
  const cancelWork = useMutation({
    mutationFn: async (id: number) => api.post(personalCompanyURL(`/user/personal-company/work-items/${id}/cancel`, groupID)),
    onSuccess: () => { success("工作项已取消"); refresh() }, onError: (value: unknown) => error(message(value, "取消失败")),
  })
  const queueWork = useMutation({
    mutationFn: async (id: number) => api.post(personalCompanyURL(`/user/personal-company/work-items/${id}/queue`, groupID)),
    onSuccess: () => { success("工作项已加入执行队列"); refresh() }, onError: (value: unknown) => error(message(value, "加入队列失败")),
  })
  const updateRuntime = useMutation({
    mutationFn: async (input: { connector_device_id: string; connector_workspace_path: string; connector_command_prefixes: string[] }) => api.put(personalCompanyURL("/user/personal-company/runtime", groupID), input),
    onSuccess: () => { success("工作室连接器已保存"); refresh() }, onError: (value: unknown) => error(message(value, "保存连接器失败")),
  })
  const updateScheduler = useMutation({
    mutationFn: async (input: { max_concurrent_tasks: number }) => api.put(personalCompanyURL("/user/personal-company/scheduler", groupID), input),
    onSuccess: () => { success("Chief 调度设置已保存"); refresh() }, onError: (value: unknown) => error(message(value, "保存调度设置失败")),
  })
  useEffect(() => {
    const balance = companyQuery.data?.balance_guard
    if (!balance || Number(balance.current) > Number(balance.floor)) return
    const key = `${groupID}:${balance.current}:${balance.floor}`
    if (balanceNoticeKey.current === key) return
    balanceNoticeKey.current = key
    error(`工作室已因余额下限停止：当前 ${formatBudget(balance.current)}，下限 ${formatBudget(balance.floor)}`)
  }, [companyQuery.data?.balance_guard, error, groupID])

  if (companyQuery.isLoading) return <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载公司状态</div>
  if (companyQuery.isError) return <LoadError onRetry={() => void companyQuery.refetch()} />
  if (!companyQuery.data?.company) return <BootstrapForm companyName={companyName} mission={mission} balanceFloor={balanceFloor} onCompanyName={setCompanyName} onMission={setMission} onBalanceFloor={setBalanceFloor} onSubmit={() => bootstrap.mutate()} pending={bootstrap.isPending} />

  const data = companyQuery.data
  const company = data.company as Company
  const objectives = data.objectives || []
  const workItems = data.work_items || []
  const approvals = data.approvals || []
  const pendingApprovalCount = approvals.length + (data.connector_approvals || []).length
  return <PersonalCompanyStudioContext.Provider value={groupID}><div className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><BriefcaseBusiness className="h-6 w-6 text-primary" /><h1 className="text-2xl font-semibold">工作室运营</h1><StateBadge state={company.state} /></div><p className="mt-1 text-sm text-muted-foreground">当前工作室：{groupID}。</p></div>
      <div className="flex shrink-0 gap-2"><Button variant="outline" size="icon" title="刷新" onClick={refresh} disabled={companyQuery.isFetching}><RefreshCw className={`h-4 w-4 ${companyQuery.isFetching ? "animate-spin" : ""}`} /></Button>{company.state === "operating" ? <Button variant="outline" onClick={() => changeState.mutate("pause")} disabled={changeState.isPending}><CirclePause className="mr-2 h-4 w-4" />暂停</Button> : <Button onClick={() => changeState.mutate("resume")} disabled={changeState.isPending}><Play className="mr-2 h-4 w-4" />恢复运行</Button>}</div>
    </header>
    <PageTabs aria-label="个人公司导航">{tabs.map((item) => <PageTab key={item} active={tab === item} onClick={() => setTab(item)}>{item}{item === "审批" && pendingApprovalCount > 0 ? <span className="ml-1.5 rounded-full bg-destructive px-1.5 py-0.5 text-xs text-destructive-foreground">{pendingApprovalCount}</span> : null}</PageTab>)}</PageTabs>
    {tab === "概览" && <Overview data={data} onShowApprovals={() => setTab("审批")} />}
    {tab === "目标" && <Objectives objectives={objectives} onCreate={() => setIsObjectiveDialogOpen(true)} />}
    {tab === "工作" && <WorkBoard workItems={workItems} onCreate={() => setIsWorkDialogOpen(true)} onCancel={(id) => cancelWork.mutate(id)} onQueue={(id) => queueWork.mutate(id)} queuePending={queueWork.isPending} onViewInternal={setInternalWork} />}
    {tab === "审批" && <Approvals approvals={approvals} connectorApprovals={data.connector_approvals || []} pending={decideApproval.isPending} onDecide={(id, decision) => decideApproval.mutate({ id, decision })} onDecideConnector={async (id, approved) => { try { await api.post(personalCompanyURL(`/user/personal-company/connector-approvals/${encodeURIComponent(id)}/decide`, groupID), { approved }); success(approved ? "已批准连接器调用" : "已拒绝连接器调用"); refresh() } catch (value) { error(message(value, "审批失败")) } }} />}
    {tab === "团队" && <StudioTeam />}
    {tab === "运行环境" && <StudioRuntime company={company} pending={updateRuntime.isPending} onSave={(input) => updateRuntime.mutate(input)} />}
    {tab === "调度" && <StudioScheduler company={company} pending={updateScheduler.isPending} onSave={(input) => updateScheduler.mutate(input)} />}
  <ObjectiveDialog open={isObjectiveDialogOpen} title={objectiveTitle} description={objectiveDescription} pending={createObjective.isPending} onOpenChange={setIsObjectiveDialogOpen} onTitle={setObjectiveTitle} onDescription={setObjectiveDescription} onSubmit={() => createObjective.mutate()} />
  <WorkDialog open={isWorkDialogOpen} title={workTitle} description={workDescription} definitionOfDone={definitionOfDone} pending={createWork.isPending} onOpenChange={setIsWorkDialogOpen} onTitle={setWorkTitle} onDescription={setWorkDescription} onDefinition={setDefinitionOfDone} onSubmit={() => createWork.mutate()} />
  <InternalSessionDialog workItem={internalWork} onClose={() => setInternalWork(null)} /></div></PersonalCompanyStudioContext.Provider>
}

function BootstrapForm({ companyName, mission, balanceFloor, onCompanyName, onMission, onBalanceFloor, onSubmit, pending }: { companyName: string; mission: string; balanceFloor: string; onCompanyName: (value: string) => void; onMission: (value: string) => void; onBalanceFloor: (value: string) => void; onSubmit: () => void; pending: boolean }) {
  return <div className="mx-auto max-w-2xl py-8"><div className="border-b pb-5"><div className="flex items-center gap-2"><BriefcaseBusiness className="h-7 w-7 text-primary" /><h1 className="text-2xl font-semibold">启用工作室运营</h1></div><p className="mt-2 text-sm text-muted-foreground">为这个工作室定义目标边界。所有连接器操作都先由检查员判断；无法判断时才会请求你的批准。</p></div><div className="mt-5 grid gap-4"><label className="grid gap-2 text-sm font-medium">运营名称<Input value={companyName} onChange={(event) => onCompanyName(event.target.value)} placeholder="例如：WindyPear 产品工作室" maxLength={160} /></label><label className="grid gap-2 text-sm font-medium">当前使命<textarea value={mission} onChange={(event) => onMission(event.target.value)} placeholder="例如：在可控成本下持续交付产品改进" className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" maxLength={4000} /></label><label className="grid gap-2 text-sm font-medium">余额运行下限<Input type="number" min="0" step="0.000001" value={balanceFloor} onChange={(event) => onBalanceFloor(event.target.value)} /><span className="text-xs font-normal text-muted-foreground">余额到达此值时，工作室自动停止创建新会话并提醒你。</span></label><div className="flex justify-end"><Button disabled={!companyName.trim() || !mission.trim() || !balanceFloor.trim() || Number(balanceFloor) < 0 || pending} onClick={onSubmit}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}启用运营</Button></div></div></div>
}

function Overview({ data, onShowApprovals }: { data: CompanyData; onShowApprovals: () => void }) {
  const health = data.health || { active_objectives: 0, active_work_items: 0, blocked_work_items: 0, pending_approvals: 0 }
  const budget = data.budget || { daily_limit: 0, monthly_limit: 0, reserved: 0, consumed: 0, monthly_reserved: 0 }
  const balance = data.balance_guard
  return <div className="space-y-5">{balance && Number(balance.current) <= Number(balance.floor) && <div className="flex gap-3 border border-amber-500/40 bg-amber-500/5 p-4"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><div className="text-sm font-medium">余额低于工作室运行下限，已自动停止新会话</div><div className="mt-1 text-xs text-muted-foreground">当前余额 {formatBudget(balance.current)}，下限 {formatBudget(balance.floor)}。补充余额或调整运营设置后再恢复。</div></div></div>}<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Target} label="活跃目标" value={health.active_objectives} /><Metric icon={ClipboardCheck} label="进行中的工作" value={health.active_work_items} /><Metric icon={AlertTriangle} label="阻塞" value={health.blocked_work_items} tone={health.blocked_work_items > 0 ? "danger" : undefined} /><Metric icon={ShieldCheck} label="待你决策" value={health.pending_approvals} tone={health.pending_approvals > 0 ? "warning" : undefined} /></div><div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,.7fr)]"><Card><CardHeader><CardTitle className="text-base">当前工作</CardTitle><CardDescription>每项工作都会启动独立的内部会话，并将结果与成本归档到工作账本。</CardDescription></CardHeader><CardContent className="space-y-2">{(data.work_items || []).length === 0 ? <Empty text="还没有工作。创建一项具体交付后，Chief 会开始安排。" /> : data.work_items?.slice(0, 6).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0"><div className="min-w-0"><div className="truncate text-sm font-medium">{item.title}</div><div className="mt-0.5 text-xs text-muted-foreground">{statusLabel(item.status)}</div></div><StatusPill status={item.status} /></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">余额与成本</CardTitle><CardDescription>真实会话消耗从现有模型计费账本回写；余额低于运行下限时自动停止。</CardDescription></CardHeader><CardContent className="space-y-3">{balance && <><BudgetLine label="当前余额" value={balance.current} /><BudgetLine label="运行下限" value={balance.floor} /></>}<BudgetLine label="工作室消耗" value={budget.consumed} /></CardContent></Card></div>{health.pending_approvals > 0 && <div className="flex flex-col gap-3 border border-amber-500/40 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><div className="text-sm font-medium">有 {health.pending_approvals} 个连接器操作正在等待你决定</div><div className="mt-1 text-xs text-muted-foreground">检查员无法安全判断时，工作会暂停在原会话中等待你的决定。</div></div></div><Button variant="outline" onClick={onShowApprovals}>查看审批</Button></div>}</div>
}

function Objectives({ objectives, onCreate }: { objectives: Objective[]; onCreate: () => void }) {
  return <div className="space-y-5"><Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base">目标是什么？</CardTitle><CardDescription className="mt-1">目标是一个持续方向或可衡量成果，例如“发布新版官网”。它不会自动创建工作；当你准备好具体交付时，再创建一项工作并可关联此目标。</CardDescription></div><Button onClick={onCreate}><Plus className="mr-2 h-4 w-4" />新建目标</Button></div></CardHeader></Card><Card><CardHeader><CardTitle className="text-base">目标</CardTitle></CardHeader><CardContent>{objectives.length === 0 ? <Empty text="尚未创建目标。" /> : <div className="divide-y">{objectives.map((objective) => <div key={objective.id} className="py-3"><div className="text-sm font-medium">{objective.title}</div>{objective.description && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{objective.description}</p>}</div>)}</div>}</CardContent></Card></div>
}

function WorkBoard({ workItems, onCreate, onCancel, onQueue, queuePending, onViewInternal }: { workItems: WorkItem[]; onCreate: () => void; onCancel: (id: number) => void; onQueue: (id: number) => void; queuePending: boolean; onViewInternal: (item: WorkItem) => void }) {
  const groups = useMemo(() => ([{ label: "计划", values: ["planned", "authorized", "queued"] }, { label: "进行中", values: ["executing", "awaiting_review", "verified"] }, { label: "等待决定", values: ["owner_decision", "blocked", "retryable_failure", "dead_letter"] }, { label: "已结束", values: ["delivered", "cancelled"] }]), [])
  return <div className="space-y-5"><Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base">工作</CardTitle><CardDescription className="mt-1">工作是可验证的具体交付。创建后由 Chief 调度器按优先级和并行额度安排独立内部会话。</CardDescription></div><Button onClick={onCreate}><Plus className="mr-2 h-4 w-4" />新建工作</Button></div></CardHeader></Card><div className="grid gap-4 xl:grid-cols-4">{groups.map((group) => { const items = workItems.filter((item) => group.values.includes(item.status)); return <section key={group.label} className="min-w-0"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-medium">{group.label}</h2><span className="text-xs text-muted-foreground">{items.length}</span></div><div className="space-y-2">{items.length === 0 ? <div className="border border-dashed p-3 text-xs text-muted-foreground">无工作</div> : items.map((item) => <Card key={item.id} className="shadow-none"><CardContent className="p-4"><div className="flex gap-2"><div className="min-w-0 flex-1"><div className="break-words text-sm font-medium">{item.title}</div><div className="mt-2 flex flex-wrap gap-1.5"><StatusPill status={item.status} /></div></div><div className="flex shrink-0 gap-1">{item.status !== "planned" && <button onClick={() => onViewInternal(item)} title="查看工作室内部会话" className="h-7 w-7 text-muted-foreground hover:text-primary"><UsersRound className="h-4 w-4" /></button>}{mayQueue(item.status) && <button onClick={() => onQueue(item.id)} disabled={queuePending} title="加入执行队列" className="h-7 w-7 text-muted-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-50">{queuePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}</button>}{!isTerminal(item.status) && <button onClick={() => onCancel(item.id)} title="取消工作" className="h-7 w-7 text-muted-foreground hover:text-destructive"><XCircle className="h-4 w-4" /></button>}</div></div>{item.description && <p className="mt-3 whitespace-pre-wrap text-xs text-muted-foreground">{item.description}</p>}<p className="mt-3 break-words text-xs text-muted-foreground">验收：{item.definition_of_done}</p></CardContent></Card>)}</div></section>})}</div></div>
}

function ObjectiveDialog({ open, title, description, pending, onOpenChange, onTitle, onDescription, onSubmit }: { open: boolean; title: string; description: string; pending: boolean; onOpenChange: (open: boolean) => void; onTitle: (value: string) => void; onDescription: (value: string) => void; onSubmit: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>新建目标</DialogTitle></DialogHeader><div className="grid gap-4"><label className="grid gap-2 text-sm font-medium">目标名称<Input value={title} onChange={(event) => onTitle(event.target.value)} placeholder="例如：在本月发布新版官网" maxLength={200} /></label><label className="grid gap-2 text-sm font-medium">目标详情<textarea value={description} onChange={(event) => onDescription(event.target.value)} placeholder="描述预期成果、范围、约束和成功标准" className="min-h-32 rounded-md border bg-background p-3 text-sm" maxLength={4000} /></label></div><DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button><Button disabled={!title.trim() || pending} onClick={onSubmit}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}创建目标</Button></DialogFooter></DialogContent></Dialog>
}

function WorkDialog({ open, title, description, definitionOfDone, pending, onOpenChange, onTitle, onDescription, onDefinition, onSubmit }: { open: boolean; title: string; description: string; definitionOfDone: string; pending: boolean; onOpenChange: (open: boolean) => void; onTitle: (value: string) => void; onDescription: (value: string) => void; onDefinition: (value: string) => void; onSubmit: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>新建工作</DialogTitle></DialogHeader><div className="grid gap-4"><label className="grid gap-2 text-sm font-medium">工作名称<Input value={title} onChange={(event) => onTitle(event.target.value)} placeholder="例如：完成官网首页设计和实现" maxLength={200} /></label><label className="grid gap-2 text-sm font-medium">工作详情<textarea value={description} onChange={(event) => onDescription(event.target.value)} placeholder="说明背景、范围、素材、限制和协作要求" className="min-h-32 rounded-md border bg-background p-3 text-sm" maxLength={4000} /></label><label className="grid gap-2 text-sm font-medium">完成标准<textarea value={definitionOfDone} onChange={(event) => onDefinition(event.target.value)} placeholder="说明如何验收，包括应提供的结果或证据" className="min-h-28 rounded-md border bg-background p-3 text-sm" maxLength={4000} /></label></div><DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button><Button disabled={!title.trim() || !definitionOfDone.trim() || pending} onClick={onSubmit}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}创建并安排</Button></DialogFooter></DialogContent></Dialog>
}

function Approvals({ approvals, connectorApprovals, pending, onDecide, onDecideConnector }: { approvals: Approval[]; connectorApprovals: ConnectorApproval[]; pending: boolean; onDecide: (id: number, decision: "approved" | "rejected") => void; onDecideConnector: (id: string, approved: boolean) => void }) { const empty = approvals.length === 0 && connectorApprovals.length === 0; return <Card><CardHeader><CardTitle className="text-base">审批与安全</CardTitle><CardDescription>检查员无法安全判断的连接器调用会在这里上提给你。</CardDescription></CardHeader><CardContent>{empty ? <Empty text="没有等待处理的审批。" /> : <div className="divide-y">{connectorApprovals.map((approval) => <div key={approval.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-medium">检查员请求你的决定：{approval.action}</div><div className="mt-1 text-xs text-muted-foreground">{approval.work_item_title} · {approval.workspace_path || "无工作目录"}</div><pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{JSON.stringify(approval.payload, null, 2)}</pre></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => onDecideConnector(approval.id, false)}>拒绝</Button><Button size="sm" onClick={() => onDecideConnector(approval.id, true)}><CheckCircle2 className="mr-2 h-4 w-4" />批准</Button></div></div>)}{approvals.map((approval) => <div key={approval.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-medium">{approval.requested_action}</div><div className="mt-1 text-xs text-muted-foreground">工作 #{approval.work_item_id}{approval.expires_at ? ` · ${formatDate(approval.expires_at)} 过期` : ""}</div></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={pending} onClick={() => onDecide(approval.id, "rejected")}>拒绝</Button><Button size="sm" disabled={pending} onClick={() => onDecide(approval.id, "approved")}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="mr-2 h-4 w-4" />批准</>}</Button></div></div>)}</div>}</CardContent></Card> }

function InternalSessionDialog({ workItem, onClose }: { workItem: WorkItem | null; onClose: () => void }) {
  const studioID = useContext(PersonalCompanyStudioContext)
  const query = useQuery<InternalSession>({ queryKey: ["studio-internal-session", studioID, workItem?.id], enabled: Boolean(workItem), queryFn: async () => (await api.get(personalCompanyURL(`/user/personal-company/work-items/${workItem?.id}/internal-session`, studioID))).data })
  return <Dialog open={workItem !== null} onOpenChange={(open) => { if (!open) onClose() }}><DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>工作室内部会话</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">{workItem?.title || ""}。这是 Chief 安排并执行工作的只读记录，不能在此编辑或继续对话。</p>{query.isLoading && <div className="py-8 text-center text-sm text-muted-foreground">正在加载内部会话...</div>}{query.isError && <div className="py-8 text-center text-sm text-muted-foreground">该工作还没有可查看的内部会话。</div>}{query.data && <div className="space-y-3">{query.data.session.messages.map((entry) => <div key={entry.id} className={`border p-3 ${entry.role === "user" ? "bg-muted/30" : ""}`}><div className="mb-1 text-xs font-medium text-muted-foreground">{entry.role === "user" ? "工作指令" : "工作室"}</div><div className="whitespace-pre-wrap text-sm">{entry.content}</div></div>)}</div>}<DialogFooter><Button onClick={onClose}>关闭</Button></DialogFooter></DialogContent></Dialog>
}

function StudioTeam() {
  const studioID = useContext(PersonalCompanyStudioContext)
  const client = useQueryClient()
  const { success, error } = useToast()
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [memberDraft, setMemberDraft] = useState<StudioMember>(() => emptyStudioMember())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const query = useQuery<StudioDetail>({ queryKey: ["advanced-chat-studio", studioID], queryFn: async () => (await api.get(`/user/advanced-chat/agent-groups/${encodeURIComponent(studioID)}`)).data })
  const agentsQuery = useQuery<ChatAgent[]>({ queryKey: ["advanced-chat-agents"], queryFn: async () => { const response = await api.get("/user/advanced-chat/agents"); return Array.isArray(response.data) ? response.data.filter(isChatAgent) : [] } })
  if (query.isLoading) return <div className="py-12 text-center text-sm text-muted-foreground">正在加载组织...</div>
  if (query.isError) return <LoadError onRetry={() => void query.refetch()} />
  const studio = query.data
  const members = studio?.agents || []
  const saveMembers = async (nextMembers: StudioMember[]) => {
    if (!studio) return
    const validation = studioMembersValidation(nextMembers)
    if (validation) { error(validation); return }
    setSaving(true)
    try {
      await api.put(`/user/advanced-chat/agent-groups/${encodeURIComponent(studioID)}`, { id: studio.id, name: studio.name, description: studio.description || "", agents: nextMembers })
      await Promise.all([query.refetch(), client.invalidateQueries({ queryKey: ["advanced-chat-agent-groups"] })])
      success("工作室成员已保存")
      setDialogOpen(false)
    } catch (value) { error(message(value, "保存工作室成员失败")) } finally { setSaving(false) }
  }
  const openAdd = () => { setEditingIndex(null); setMemberDraft(emptyStudioMember()); setDialogOpen(true) }
  const openEdit = (member: StudioMember, index: number) => { setEditingIndex(index); setMemberDraft({ ...member }); setDialogOpen(true) }
  const saveMember = () => {
    const normalized = { ...memberDraft, id: memberDraft.id.trim() || newStudioMemberID(), name: memberDraft.name.trim(), chat_agent_id: (memberDraft.chat_agent_id || "").trim() }
    if (!normalized.chat_agent_id) { error("请选择一个现有 Agent"); return }
    const nextMembers = editingIndex === null ? [...members, normalized] : members.map((member, index) => index === editingIndex ? normalized : member)
    void saveMembers(nextMembers)
  }
  return <div className="space-y-5"><Card><CardHeader><CardTitle className="flex items-center justify-between gap-3 text-base"><span>工作室团队</span><Button variant="outline" size="sm" onClick={openAdd}><Plus className="mr-2 h-4 w-4" />添加成员</Button></CardTitle><CardDescription>团队就是当前工作室成员。每名成员绑定一个 Agent，并以现实职称说明其工作职责。</CardDescription></CardHeader><CardContent>{members.length === 0 ? <Empty text="当前工作室没有成员。" /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{members.map((member, index) => <div key={member.id} className="border p-4"><div className="flex items-start justify-between gap-2"><UsersRound className="h-5 w-5 text-primary" /><div className="flex gap-1"><button title="编辑成员" onClick={() => openEdit(member, index)} className="text-muted-foreground hover:text-primary"><Pencil className="h-4 w-4" /></button><button title="移除成员" disabled={saving} onClick={() => void saveMembers(members.filter((_, itemIndex) => itemIndex !== index))} className="text-muted-foreground hover:text-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div></div><div className="mt-3 text-sm font-medium">{member.name || member.id}</div><div className="mt-1 text-xs text-muted-foreground">{studioJobTitle(member.type)} · {member.default_model || "使用绑定 Agent 模型"}</div><div className="mt-3 text-xs text-muted-foreground">{member.chat_agent_id ? "已绑定 Agent" : "未绑定 Agent"}</div></div>)}</div>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">AI 成员生成</CardTitle><CardDescription>即将推出：根据目标和当前团队缺口生成候选 Agent 成员，并在工作室编辑器中确认后加入团队。</CardDescription></CardHeader><CardContent><Button variant="outline" disabled>即将推出</Button></CardContent></Card><StudioMemberDialog open={dialogOpen} member={memberDraft} agents={agentsQuery.data || []} saving={saving} onOpenChange={setDialogOpen} onChange={setMemberDraft} onSave={saveMember} /></div>
}

function StudioMemberDialog({ open, member, agents, saving, onOpenChange, onChange, onSave }: { open: boolean; member: StudioMember; agents: ChatAgent[]; saving: boolean; onOpenChange: (open: boolean) => void; onChange: (member: StudioMember) => void; onSave: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>编辑工作室成员</DialogTitle></DialogHeader><div className="grid gap-4"><label className="grid gap-2 text-sm font-medium">绑定 Agent<Select value={String((member.chat_agent_id || "") || "__shadcn_empty__")} onValueChange={(value) => { const agent = agents.find((item) => item.id === (value === "__shadcn_empty__" ? "" : value)); onChange({ ...member, chat_agent_id: (value === "__shadcn_empty__" ? "" : value), name: agent?.name || member.name }) }}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__shadcn_empty__">选择 Agent</SelectItem>{agents.map((agent) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>)}</SelectContent></Select></label><label className="grid gap-2 text-sm font-medium">成员名称<Input value={member.name} onChange={(event) => onChange({ ...member, name: event.target.value })} /></label><label className="grid gap-2 text-sm font-medium">职称<Select value={String((member.type) || "__shadcn_empty__")} onValueChange={(value) => onChange({ ...member, type: (value === "__shadcn_empty__" ? "" : value) as StudioMember["type"] })}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="chief">总经理</SelectItem><SelectItem value="worker">员工</SelectItem><SelectItem value="critic">业务分析员</SelectItem><SelectItem value="reviewer">测试员</SelectItem><SelectItem value="checker">检查员</SelectItem></SelectContent></Select></label></div><DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button><Button disabled={saving} onClick={onSave}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}保存成员</Button></DialogFooter></DialogContent></Dialog>
}

function StudioRuntime({ company, pending, onSave }: { company: Company; pending: boolean; onSave: (input: { connector_device_id: string; connector_workspace_path: string; connector_command_prefixes: string[] }) => void }) {
  const [deviceID, setDeviceID] = useState(company.connector_device_id || "")
  const [workspacePath, setWorkspacePath] = useState(company.connector_workspace_path || "")
  const [prefixes, setPrefixes] = useState(() => decodePrefixes(company.connector_command_prefixes))
  const devices = useQuery<ConnectorDevice[]>({ queryKey: ["advanced-chat-connector-devices"], queryFn: async () => { const response = await api.get("/user/advanced-chat/devices"); return Array.isArray(response.data) ? response.data : [] } })
  const onlineDevices = (devices.data || []).filter((device) => device.online || device.status === "online")
  return <div className="space-y-5"><Card><CardHeader><CardTitle className="text-base">工作室连接器</CardTitle><CardDescription>为自动工作会话指定可用的工作目录。模型、成员、Skill 与 MCP 始终使用工作室现有配置；连接器所有工具操作仍需手动批准。</CardDescription></CardHeader><CardContent className="grid gap-4"><label className="grid gap-2 text-sm font-medium">连接器<Select value={String((deviceID) || "__shadcn_empty__")} onValueChange={(value) => setDeviceID((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__shadcn_empty__">不使用连接器（仅模型与 MCP）</SelectItem>{onlineDevices.map((device) => <SelectItem key={device.id} value={String(device.id)}>{device.name || device.id}</SelectItem>)}</SelectContent></Select></label>{devices.isLoading && <div className="text-xs text-muted-foreground">正在加载连接器...</div>}{!devices.isLoading && onlineDevices.length === 0 && <div className="text-xs text-muted-foreground">没有在线连接器。请先在 Agent Chat 的设备页面连接本机或 CLI 连接器。</div>}<label className="grid gap-2 text-sm font-medium">工作目录<Input value={workspacePath} onChange={(event) => setWorkspacePath(event.target.value)} disabled={!deviceID} placeholder="例如 D:\\dev\\project" /></label><label className="grid gap-2 text-sm font-medium">允许的命令前缀（每行一个）<textarea value={prefixes} onChange={(event) => setPrefixes(event.target.value)} disabled={!deviceID} placeholder={'例如\ngit status\ngo test'} className="min-h-24 rounded-md border bg-background p-3 font-mono text-sm" /></label><div className="flex justify-end"><Button disabled={pending || (!deviceID && Boolean(workspacePath.trim()))} onClick={() => onSave({ connector_device_id: deviceID, connector_workspace_path: workspacePath, connector_command_prefixes: prefixes.split("\n").map((value) => value.trim()).filter(Boolean) })}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}保存连接器</Button></div></CardContent></Card></div>
}

function StudioScheduler({ company, pending, onSave }: { company: Company; pending: boolean; onSave: (input: { max_concurrent_tasks: number }) => void }) {
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(String(company.max_concurrent_tasks || 1))
  useEffect(() => setMaxConcurrentTasks(String(company.max_concurrent_tasks || 1)), [company.max_concurrent_tasks])
  const value = Number(maxConcurrentTasks)
  const valid = Number.isInteger(value) && value >= 1 && value <= 8
  return <div className="space-y-5"><Card><CardHeader><CardTitle className="text-base">Chief 任务调度</CardTitle><CardDescription>Chief 每 10 秒消费工作室信号。它优先安排待检查任务，再按优先级和创建时间安排执行任务；每个任务都运行在不可编辑的内部会话中。</CardDescription></CardHeader><CardContent className="grid max-w-xl gap-4"><label className="grid gap-2 text-sm font-medium">最大并行任务数<Input type="number" min="1" max="8" step="1" value={maxConcurrentTasks} onChange={(event) => setMaxConcurrentTasks(event.target.value)} /><span className="text-xs font-normal text-muted-foreground">1 为串行执行；提高数值可让 Chief 同时启动多个彼此独立的内部任务。复核任务也占用一个并行额度。</span></label><div className="flex justify-end"><Button disabled={pending || !valid} onClick={() => onSave({ max_concurrent_tasks: value })}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}保存调度设置</Button></div></CardContent></Card></div>
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Target; label: string; value: number; tone?: "danger" | "warning" }) { return <div className="border p-4"><Icon className={`h-5 w-5 ${tone === "danger" ? "text-destructive" : tone === "warning" ? "text-amber-600" : "text-primary"}`} /><div className="mt-3 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{label}</div></div> }
function BudgetLine({ label, value }: { label: string; value: string | number }) { return <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium">{formatBudget(value)}</span></div> }
function StatusPill({ status }: { status: WorkStatus }) { return <span className={`rounded px-1.5 py-0.5 text-xs ${status === "blocked" || status === "owner_decision" || status === "retryable_failure" || status === "dead_letter" ? "bg-amber-500/15 text-amber-700" : status === "cancelled" ? "bg-muted text-muted-foreground" : status === "delivered" ? "bg-emerald-500/15 text-emerald-700" : "bg-blue-500/15 text-blue-700"}`}>{statusLabel(status)}</span> }
function Empty({ text }: { text: string }) { return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div> }
function LoadError({ onRetry }: { onRetry: () => void }) { return <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">无法加载个人公司数据<Button variant="outline" size="sm" onClick={onRetry}>重试</Button></div> }
function StateBadge({ state }: { state: CompanyState }) { const label: Record<CompanyState, string> = { draft: "草稿", bootstrap: "初始化", operating: "运行中", attention_required: "需要关注", safe_mode: "安全模式", paused: "已暂停", archived: "已归档" }; return <span className={`rounded px-2 py-0.5 text-xs font-medium ${state === "operating" ? "bg-emerald-500/15 text-emerald-700" : state === "paused" ? "bg-muted text-muted-foreground" : "bg-amber-500/15 text-amber-700"}`}>{label[state]}</span> }
function statusLabel(value: string) { const labels: Record<string, string> = { planned: "已计划", owner_decision: "等待决定", authorized: "已授权", queued: "已排队", executing: "执行中", awaiting_review: "待复核", verified: "已验证", delivered: "已交付", blocked: "受阻", retryable_failure: "可重试失败", dead_letter: "需人工处理", cancelled: "已取消" }; return labels[value] || value }
function studioJobTitle(type: StudioMember["type"]) { const titles: Record<StudioMember["type"], string> = { chief: "总经理", worker: "员工", critic: "业务分析员", reviewer: "测试员", checker: "检查员" }; return titles[type] || "员工" }
function isTerminal(status: WorkStatus) { return status === "cancelled" || status === "delivered" }
function mayQueue(status: WorkStatus) { return status === "planned" || status === "authorized" }
function formatBudget(value: string | number) { const numberValue = typeof value === "string" ? Number(value) : value; return Number.isFinite(numberValue) ? numberValue.toLocaleString("zh-CN", { maximumFractionDigits: 4 }) : String(value) }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date) }
function decodePrefixes(value?: string) { try { const parsed: unknown = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").join("\n") : "" } catch { return "" } }
function emptyStudioMember(): StudioMember { return { id: "", name: "", type: "worker", chat_agent_id: "" } }
function newStudioMemberID() { return `member-${Date.now().toString(36)}` }
function studioMembersValidation(members: StudioMember[]) { if (members.some((member) => !member.chat_agent_id)) return "每个工作室成员都必须绑定 Agent"; if (new Set(members.map((member) => member.id)).size !== members.length) return "成员标识不能重复"; if (members.filter((member) => member.type === "chief").length !== 1) return "工作室必须且只能有一个 Chief"; if (members.filter((member) => member.type === "checker").length !== 1) return "工作室必须且只能有一个 Checker"; return "" }
function isChatAgent(value: unknown): value is ChatAgent { const item = value as { id?: unknown; name?: unknown }; return typeof item?.id === "string" && typeof item?.name === "string" }
function message(value: unknown, fallback: string) { const candidate = value as { response?: { data?: { error?: string } } }; return candidate.response?.data?.error || fallback }
