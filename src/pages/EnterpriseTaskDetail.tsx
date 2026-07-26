import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMemo, useState } from "react"
import { Link, useLocation, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, FolderKanban, Plus, Trash2 } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"

interface User { id: number; username?: string; email?: string }
interface Task { id: number; title: string; description: string; status: string; owner_user_id: number; owner?: User }
interface Assignment { id: number; user_id: number; role: string; user?: User }
interface Department { id: number; department_id: number; department?: OrgDepartment }
interface DeviceAssignment { id: number; device_id: number; status: string; allowed_tools: string }
interface Device { id: number; name: string; online?: boolean }
interface QuotaAccount { id: number; scope_type: string; scope_key: string; limit_amount: string; reserved_amount: string; consumed_amount: string }
interface Detail { task: Task; assignments: Assignment[]; departments: Department[]; device_assignments: DeviceAssignment[]; pool?: { id?: number; name?: string; resource_user_id?: number }; quota_account?: QuotaAccount }
interface Member { id: number; user_id: number; status: string; user?: User }
interface OrgDepartment { id: number; name: string }
interface PersonalResource { id: string; title?: string; name?: string }
type DialogKind = "participant" | "department" | "device" | "quota" | "resource" | null

export default function EnterpriseTaskDetail() {
  const { id = "" } = useParams()
  const managed = new URLSearchParams(useLocation().search).get("managed") === "1"
  const client = useQueryClient()
  const { success, error } = useToast()
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [memberID, setMemberID] = useState("")
  const [departmentID, setDepartmentID] = useState("")
  const [deviceID, setDeviceID] = useState("")
  const [parentQuotaID, setParentQuotaID] = useState("")
  const [amount, setAmount] = useState("")
  const [resourceType, setResourceType] = useState<"sessions" | "files">("sessions")
  const [resourceID, setResourceID] = useState("")
  const base = managed ? `/user/enterprise/managed-tasks/${encodeURIComponent(id)}` : `/user/enterprise/tasks/${encodeURIComponent(id)}`
  const detail = useQuery<Detail>({ queryKey: ["enterprise-task-detail", id, managed], queryFn: async () => (await api.get(base)).data, enabled: Boolean(id) })
  const members = useQuery<{ members: Member[] }>({ queryKey: ["enterprise-members"], queryFn: async () => (await api.get("/user/enterprise/members")).data, enabled: managed })
  const departments = useQuery<{ departments: OrgDepartment[] }>({ queryKey: ["enterprise-departments"], queryFn: async () => (await api.get("/user/enterprise/departments")).data, enabled: managed })
  const devices = useQuery<{ devices: Device[] }>({ queryKey: ["enterprise-devices"], queryFn: async () => (await api.get("/user/enterprise/devices")).data, enabled: managed })
  const quotas = useQuery<{ accounts: QuotaAccount[] }>({ queryKey: ["enterprise-quota-accounts"], queryFn: async () => (await api.get("/user/enterprise/quota-accounts")).data, enabled: managed })
  const poolWritable = Boolean(detail.data?.pool?.id) && detail.data?.task.status === "running"
  const personalSessions = useQuery<PersonalResource[]>({ queryKey: ["personal-advanced-chat-sessions"], queryFn: async () => { const response = await api.get("/user/advanced-chat/sessions"); return Array.isArray(response.data) ? response.data : [] }, enabled: poolWritable })
  const personalFiles = useQuery<{ files: PersonalResource[] }>({ queryKey: ["personal-advanced-chat-files"], queryFn: async () => (await api.get("/user/advanced-chat/files")).data, enabled: poolWritable })
  const refresh = () => client.invalidateQueries({ queryKey: ["enterprise-task-detail", id, managed] })
  const closeDialog = () => { setDialog(null); setMemberID(""); setDepartmentID(""); setDeviceID(""); setParentQuotaID(""); setAmount(""); setResourceType("sessions"); setResourceID("") }
  const addParticipant = useMutation({ mutationFn: () => api.post(`${base}/participants`, { user_id: Number(memberID), role: "participant" }), onSuccess: () => { closeDialog(); void refresh(); success("参与人已添加") }, onError: () => error("添加参与人失败") })
  const removeParticipant = useMutation({ mutationFn: (userID: number) => api.delete(`${base}/participants/${userID}`), onSuccess: () => { void refresh(); success("参与人已移除") }, onError: () => error("移除参与人失败") })
  const addDepartment = useMutation({ mutationFn: () => api.post(`${base}/departments`, { department_id: Number(departmentID) }), onSuccess: () => { closeDialog(); void refresh(); success("部门已添加") }, onError: () => error("添加部门失败") })
  const removeDepartment = useMutation({ mutationFn: (value: number) => api.delete(`${base}/departments/${value}`), onSuccess: () => { void refresh(); success("部门已移除") }, onError: () => error("移除部门失败") })
  const assignDevice = useMutation({ mutationFn: () => api.post("/user/enterprise/device-assignments", { device_id: Number(deviceID), task_id: Number(id), allowed_tools: [] }), onSuccess: () => { closeDialog(); void refresh(); success("设备已下拨到任务池") }, onError: () => error("分配设备失败") })
  const revokeDevice = useMutation({ mutationFn: (assignmentID: number) => api.post(`/user/enterprise/device-assignments/${assignmentID}/revoke`), onSuccess: () => { void refresh(); success("任务池设备已撤销") }, onError: () => error("撤销设备失败") })
  const allocateQuota = useMutation({ mutationFn: () => api.post("/user/enterprise/quota-allocations", { parent_account_id: Number(parentQuotaID), child_account_id: detail.data?.quota_account?.id, amount }), onSuccess: () => { closeDialog(); void refresh(); void client.invalidateQueries({ queryKey: ["enterprise-quota-accounts"] }); success("额度已下拨到任务池") }, onError: () => error("下拨额度失败") })
  const assignResource = useMutation({ mutationFn: () => api.post(`/user/enterprise/shared-pools/${detail.data?.pool?.id}/${resourceType}`, { id: resourceID }), onSuccess: () => { closeDialog(); void client.invalidateQueries({ queryKey: ["enterprise-shared-pool-sessions"] }); void client.invalidateQueries({ queryKey: ["enterprise-shared-pool-files"] }); success(resourceType === "sessions" ? "会话已分配到任务池" : "文件已分配到任务池") }, onError: () => error(resourceType === "sessions" ? "分配会话失败" : "分配文件失败") })
  const task = detail.data?.task
  const userName = (user?: User, fallback?: number) => user?.username || user?.email || (fallback ? "未知用户" : "未指定")
  const deviceName = (device: number) => devices.data?.devices.find((item) => item.id === device)?.name || `设备 #${device}`
  const availableMembers = useMemo(() => (members.data?.members || []).filter((member) => member.status === "active" && !detail.data?.assignments.some((item) => item.user_id === member.user_id)), [detail.data?.assignments, members.data?.members])
  const availableDepartments = useMemo(() => (departments.data?.departments || []).filter((item) => !detail.data?.departments.some((entry) => entry.department_id === item.id)), [departments.data?.departments, detail.data?.departments])
  const availableDevices = useMemo(() => (devices.data?.devices || []).filter((device) => !detail.data?.device_assignments.some((assignment) => assignment.device_id === device.id)), [devices.data?.devices, detail.data?.device_assignments])
  const personalResources = resourceType === "sessions" ? personalSessions.data || [] : personalFiles.data?.files || []
  if (detail.isLoading) return <div className="p-6 text-sm text-muted-foreground">加载任务详情...</div>
  if (!task) return <div className="p-6 text-sm text-destructive">任务不存在或无权访问。</div>
  return <div className="space-y-5">
    <div><Link className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" to={managed ? "/dashboard/enterprise" : "/dashboard/tasks"}><ArrowLeft size={16} />返回任务列表</Link><h1 className="text-2xl font-semibold">{task.title}</h1><p className="mt-1 text-sm text-muted-foreground">状态：{task.status} · 负责人：{userName(detail.data?.assignments.find((item) => item.role === "owner")?.user, task.owner_user_id)}</p></div>
    {task.description && <Card><CardContent className="whitespace-pre-wrap p-5 text-sm">{task.description}</CardContent></Card>}
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="任务资源池"><div className="flex items-center gap-2 text-sm"><FolderKanban className="h-4 w-4 text-teal-600" />{detail.data?.pool?.name || "任务池尚未初始化"}</div><p className="mt-2 text-xs text-muted-foreground">{task.status === "running" ? "任务进行中，可使用池内会话、文件和已分配设备。" : "任务未进行中，池内资源已锁定。"}</p><p className="mt-2 text-xs text-muted-foreground">额度：{detail.data?.quota_account?.limit_amount || "0"} / 预留 {detail.data?.quota_account?.reserved_amount || "0"} / 消耗 {detail.data?.quota_account?.consumed_amount || "0"}</p><div className="mt-3 flex flex-wrap gap-2">{managed && detail.data?.quota_account?.id && <Button size="sm" variant="outline" onClick={() => setDialog("quota")}><Plus className="mr-1 h-4 w-4" />下拨额度</Button>}<Button size="sm" variant="outline" disabled={!poolWritable} onClick={() => setDialog("resource")}><Plus className="mr-1 h-4 w-4" />分配会话或文件</Button></div></Panel>
      <Panel title="池内设备">{managed && <div className="mb-3"><Button size="sm" variant="outline" onClick={() => setDialog("device")}><Plus className="mr-1 h-4 w-4" />下拨设备</Button></div>}{detail.data?.device_assignments.length ? <div className="space-y-2">{detail.data.device_assignments.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2 text-sm"><span>{deviceName(item.device_id)} · {item.status}</span>{managed && <Button size="icon" variant="ghost" aria-label="撤销任务设备" disabled={revokeDevice.isPending} onClick={() => revokeDevice.mutate(item.id)}><Trash2 size={15} /></Button>}</div>)}</div> : <Empty text="暂无任务设备分配。" />}</Panel>
      <Panel title="参与人">{managed && <div className="mb-3"><Button size="sm" variant="outline" onClick={() => setDialog("participant")}><Plus className="mr-1 h-4 w-4" />添加参与人</Button></div>}<div className="space-y-2">{detail.data?.assignments.map((item) => <div key={item.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm"><span>{userName(item.user, item.user_id)} · {item.role}</span>{managed && item.role !== "owner" && <Button size="icon" variant="ghost" onClick={() => removeParticipant.mutate(item.user_id)} aria-label="移除参与人"><Trash2 size={15} /></Button>}</div>)}</div></Panel>
      <Panel title="参与部门">{managed && <div className="mb-3"><Button size="sm" variant="outline" onClick={() => setDialog("department")}><Plus className="mr-1 h-4 w-4" />添加部门</Button></div>}<div className="space-y-2">{detail.data?.departments.length ? detail.data.departments.map((item) => <div key={item.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm"><span>{item.department?.name || `部门 #${item.department_id}`}</span>{managed && <Button size="icon" variant="ghost" onClick={() => removeDepartment.mutate(item.department_id)} aria-label="移除部门"><Trash2 size={15} /></Button>}</div>) : <Empty text="暂无参与部门。" />}</div></Panel>
    </div>
    <TaskDialog open={dialog === "participant"} title="添加任务参与人" pending={addParticipant.isPending} onClose={closeDialog} onSave={() => addParticipant.mutate()} disabled={!memberID}><Select value={String((memberID) || "__shadcn_empty__")} onValueChange={(value) => setMemberID((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__shadcn_empty__">选择员工</SelectItem>{availableMembers.map((item) => <SelectItem key={item.id} value={String(item.user_id)}>{userName(item.user, item.user_id)}</SelectItem>)}</SelectContent></Select></TaskDialog>
    <TaskDialog open={dialog === "department"} title="添加参与部门" pending={addDepartment.isPending} onClose={closeDialog} onSave={() => addDepartment.mutate()} disabled={!departmentID}><Select value={String((departmentID) || "__shadcn_empty__")} onValueChange={(value) => setDepartmentID((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__shadcn_empty__">选择部门</SelectItem>{availableDepartments.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select></TaskDialog>
    <TaskDialog open={dialog === "device"} title="下拨设备到任务池" pending={assignDevice.isPending} onClose={closeDialog} onSave={() => assignDevice.mutate()} disabled={!deviceID}><Select value={String((deviceID) || "__shadcn_empty__")} onValueChange={(value) => setDeviceID((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__shadcn_empty__">选择企业设备</SelectItem>{availableDevices.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}{item.online ? "（在线）" : "（离线）"}</SelectItem>)}</SelectContent></Select></TaskDialog>
    <TaskDialog open={dialog === "quota"} title="下拨额度到任务池" pending={allocateQuota.isPending} onClose={closeDialog} onSave={() => allocateQuota.mutate()} disabled={!parentQuotaID || !amount}><Select value={String((parentQuotaID) || "__shadcn_empty__")} onValueChange={(value) => setParentQuotaID((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__shadcn_empty__">选择来源额度账户</SelectItem>{(quotas.data?.accounts || []).filter((item) => item.id !== detail.data?.quota_account?.id).map((item) => <SelectItem key={item.id} value={String(item.id)}>#{item.id} · {item.scope_type} · {item.scope_key}</SelectItem>)}</SelectContent></Select><Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="下拨额度" /></TaskDialog>
    <TaskDialog open={dialog === "resource"} title="分配资源到任务池" pending={assignResource.isPending} onClose={closeDialog} onSave={() => assignResource.mutate()} disabled={!resourceID}><Select value={String((resourceType) || "__shadcn_empty__")} onValueChange={(value) => { setResourceType((value === "__shadcn_empty__" ? "" : value) as "sessions" | "files"); setResourceID("") }}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sessions">我的会话</SelectItem><SelectItem value="files">我的文件</SelectItem></SelectContent></Select><Select value={String((resourceID) || "__shadcn_empty__")} onValueChange={(value) => setResourceID((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__shadcn_empty__">选择资源</SelectItem>{personalResources.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.title || item.name || item.id}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">资源会复制到任务的内置池，参与人可在任务会话/文件夹中协作。</p></TaskDialog>
  </div>
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent>{children}</CardContent></Card> }
function Empty({ text }: { text: string }) { return <p className="text-sm text-muted-foreground">{text}</p> }
function TaskDialog({ open, title, children, pending, disabled, onClose, onSave }: { open: boolean; title: string; children: React.ReactNode; pending: boolean; disabled?: boolean; onClose: () => void; onSave: () => void }) { return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader><div className="space-y-3">{children}</div><DialogFooter><Button variant="outline" onClick={onClose}>取消</Button><Button disabled={pending || disabled} onClick={onSave}>{pending ? "提交中..." : "确认"}</Button></DialogFooter></DialogContent></Dialog> }
