import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Activity, Filter } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { TableQuery } from "@/components/ui/table"
import { tableQueryParams } from "@/lib/table-query"
import { useI18n } from "@/lib/i18n"
import { formatCurrency, useCurrencyDisplayName } from "@/lib/currency"

interface AuditLogUser {
  id: number
  username: string
  email: string
}

interface AuditLog {
  id: number
  log_type: string
  action: string
  resource: string
  user_id?: number
  user?: AuditLogUser
  api_key_id?: number
  method: string
  path: string
  query?: string
  status_code: number
  ip_address: string
  user_agent: string
  message: string
  metadata?: string
  duration_ms: number
  created_at: string
}

interface TokenLog {
  id: number
  user_id: number
  api_key_id?: number
  user_channel_id?: number
  channel_id: number
  model_name: string
  input_tokens: number
  output_tokens: number
  cached_input_tokens: number
  cache_write_input_tokens: number
  cache_write_1h_input_tokens: number
  response_time_ms: number
  first_response_time_ms: number
  group_multiplier: string | number
  user_channel_multiplier: string | number
  input_price: string | number
  output_price: string | number
  cached_input_price: string | number
  pricing_formula: string
  cost: string | number
  created_at: string
}

interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

const pageSize = 25
const emptyTableQuery = (): TableQuery => ({ filters: {} })

export default function AdminAuditLogs() {
  const { language } = useI18n()
  const currency = useCurrencyDisplayName()
  const copy = language === "zh" ? zhCopy : enCopy
  const [page, setPage] = useState(1)
  const [logType, setLogType] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [action, setAction] = useState("")
  const [path, setPath] = useState("")
  const [userID, setUserID] = useState("")
  const [statusCode, setStatusCode] = useState("")
  const [callPage, setCallPage] = useState(1)
  const [modelName, setModelName] = useState("")
  const [auditTableQuery, setAuditTableQuery] = useState<TableQuery>(emptyTableQuery)
  const [callTableQuery, setCallTableQuery] = useState<TableQuery>(emptyTableQuery)

  const { data = emptyPage<AuditLog>(page), isLoading } = useQuery<PaginatedResult<AuditLog>>({
    queryKey: ["audit-logs", page, logType, startDate, endDate, action, path, userID, statusCode, auditTableQuery],
    queryFn: async () => {
      const res = await api.get("/audit-logs", {
        params: cleanParams({
          paginated: 1,
          page,
          page_size: pageSize,
          log_type: logType,
          start_date: startDate,
          end_date: endDate,
          action,
          path,
          user_id: userID,
          status_code: statusCode,
          ...tableQueryParams(auditTableQuery),
        }),
      })
      return paginatedResult<AuditLog>(res.data, page)
    },
  })
  const { data: callLogs = emptyPage<TokenLog>(callPage), isLoading: isCallLogsLoading } = useQuery<PaginatedResult<TokenLog>>({
    queryKey: ["admin-call-logs", callPage, startDate, endDate, userID, modelName, callTableQuery],
    queryFn: async () => {
      const res = await api.get("/logs", { params: cleanParams({ paginated: 1, page: callPage, page_size: pageSize, start_time: startDate, end_time: endDate, user_id: userID, model_name: modelName, ...tableQueryParams(callTableQuery) }) })
      return paginatedResult<TokenLog>(res.data, callPage)
    },
  })

  const resetFilters = () => {
    setLogType("")
    setStartDate("")
    setEndDate("")
    setAction("")
    setPath("")
    setUserID("")
    setStatusCode("")
    setModelName("")
    setPage(1)
    setCallPage(1)
    setAuditTableQuery(emptyTableQuery())
    setCallTableQuery(emptyTableQuery())
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{copy.title}</h1>
        <div className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{copy.filters}</CardTitle>
          <Filter className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">{copy.type}</span>
              <Select value={String((logType) || "__shadcn_empty__")} onValueChange={(value) => { setLogType((value === "__shadcn_empty__" ? "" : value)); setPage(1) }}><SelectTrigger className="h-10 w-full rounded-2xl border border-input bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="__shadcn_empty__">{copy.allTypes}</SelectItem>
                <SelectItem value="api">{copy.typeAPI}</SelectItem>
                <SelectItem value="login">{copy.typeLogin}</SelectItem>
                <SelectItem value="admin">{copy.typeAdmin}</SelectItem>
                <SelectItem value="system">{copy.typeSystem}</SelectItem>
              </SelectContent></Select>
            </label>
            <DateFilterInput label={copy.startDate} value={startDate} onChange={(value) => { setStartDate(value); setPage(1) }} />
            <DateFilterInput label={copy.endDate} value={endDate} onChange={(value) => { setEndDate(value); setPage(1) }} />
            <FilterInput label={copy.statusCode} value={statusCode} type="number" placeholder="500" onChange={(value) => { setStatusCode(value); setPage(1) }} />
            <FilterInput label={copy.action} value={action} placeholder="login" onChange={(value) => { setAction(value); setPage(1) }} />
            <FilterInput label={copy.path} value={path} placeholder="/api/settings" onChange={(value) => { setPath(value); setPage(1) }} />
            <FilterInput label={copy.userID} value={userID} type="number" placeholder="1" onChange={(value) => { setUserID(value); setPage(1) }} />
            <div className="flex items-end">
              <Button variant="outline" onClick={resetFilters}>{copy.reset}</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{copy.logs}</CardTitle>
          <Activity className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table onQueryChange={(query) => { setAuditTableQuery(query); setPage(1) }}>
              <TableHeader>
                <TableRow>
                  <TableHead sortKey="created_at">{copy.time}</TableHead>
                  <TableHead sortKey="log_type">{copy.type}</TableHead>
                  <TableHead sortKey="action">{copy.action}</TableHead>
                  <TableHead sortKey="user_id">{copy.user}</TableHead>
                  <TableHead sortKey="path">{copy.request}</TableHead>
                  <TableHead queryKey="status_code">{copy.statusCode}</TableHead>
                  <TableHead sortKey="ip_address">{copy.ip}</TableHead>
                  <TableHead sortKey="duration_ms">{copy.duration}</TableHead>
                  <TableHead sortKey="message">{copy.message}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">{copy.loading}</TableCell></TableRow>
                ) : data.items.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">{copy.empty}</TableCell></TableRow>
                ) : (
                  data.items.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs">{formatDateTime(log.created_at)}</TableCell>
                      <TableCell><span className={typeBadgeClass(log.log_type)}>{typeLabel(log.log_type, copy)}</span></TableCell>
                      <TableCell className="min-w-48 text-xs"><div className="font-medium text-foreground">{humanAuditAction(log.action) || log.message || log.action}</div><div className="mt-1 font-mono text-muted-foreground">{log.action}</div></TableCell>
                      <TableCell className="min-w-32 text-xs">{log.user ? `${log.user.username || log.user.email} #${log.user.id}` : log.user_id ? `#${log.user_id}` : "-"}</TableCell>
                      <TableCell className="min-w-72 text-xs">
                        <div className="font-mono">{log.method} {log.path}</div>
                        {log.query && <div className="truncate text-muted-foreground">?{log.query}</div>}
                      </TableCell>
                      <TableCell><span className={statusBadgeClass(log.status_code)}>{log.status_code || "-"}</span></TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{log.ip_address || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{log.duration_ms} ms</TableCell>
                      <TableCell className="max-w-80 truncate text-xs text-muted-foreground" title={log.metadata || log.user_agent}>{log.metadata || log.user_agent || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>{copy.total.replace("{total}", String(data.total))}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>{copy.prev}</Button>
              <span>{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>{copy.next}</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle>调用明细</CardTitle><Activity className="h-5 w-5 text-muted-foreground" /></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <DateFilterInput label={copy.startDate} value={startDate} onChange={(value) => { setStartDate(value); setCallPage(1) }} />
            <DateFilterInput label={copy.endDate} value={endDate} onChange={(value) => { setEndDate(value); setCallPage(1) }} />
            <FilterInput label={copy.userID} value={userID} type="number" placeholder="1" onChange={(value) => { setUserID(value); setCallPage(1) }} />
            <FilterInput label="模型" value={modelName} placeholder="gpt-4o" onChange={(value) => { setModelName(value); setCallPage(1) }} />
          </div>
          <div className="overflow-x-auto rounded-md border"><Table onQueryChange={(query) => { setCallTableQuery(query); setCallPage(1) }}><TableHeader><TableRow><TableHead sortKey="created_at">{copy.time}</TableHead><TableHead sortKey="user_id">{copy.user}</TableHead><TableHead sortKey="channel_id">路由</TableHead><TableHead queryKey="model_name">模型</TableHead><TableHead sortKey="total_tokens">Token</TableHead><TableHead sortKey="input_price">价格</TableHead><TableHead sortKey="group_multiplier">倍率</TableHead><TableHead sortKey="pricing_formula">算式</TableHead><TableHead sortKey="response_time_ms">FRT / 总耗时</TableHead><TableHead sortKey="cost">费用</TableHead></TableRow></TableHeader><TableBody>
            {isCallLogsLoading ? <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">{copy.loading}</TableCell></TableRow> : callLogs.items.length === 0 ? <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">暂无调用记录</TableCell></TableRow> : callLogs.items.map((log) => <TableRow key={log.id}><TableCell className="whitespace-nowrap text-xs">{formatDateTime(log.created_at)}</TableCell><TableCell>#{log.user_id}</TableCell><TableCell className="whitespace-nowrap text-xs">key {log.api_key_id || "-"}<br />{log.user_channel_id || "-"} / {log.channel_id}</TableCell><TableCell>{log.model_name}</TableCell><TableCell className="whitespace-nowrap text-xs">in {log.input_tokens} · out {log.output_tokens}<br /><span className="text-muted-foreground">cache {log.cached_input_tokens || 0} / write {log.cache_write_input_tokens || 0} / 1h {log.cache_write_1h_input_tokens || 0}</span></TableCell><TableCell className="whitespace-nowrap text-xs">in {formatPrice(log.input_price, currency)}<br />out {formatPrice(log.output_price, currency)}<br />cache {formatPrice(log.cached_input_price, currency)}</TableCell><TableCell className="whitespace-nowrap text-xs">组 {formatMultiplier(log.group_multiplier)}×<br />通道 {formatMultiplier(log.user_channel_multiplier)}×</TableCell><TableCell className="max-w-80 truncate text-xs" title={log.pricing_formula}>{log.pricing_formula || "-"}</TableCell><TableCell className="whitespace-nowrap text-xs">{formatLatency(log.first_response_time_ms)}<br />{formatLatency(log.response_time_ms)}</TableCell><TableCell>{formatCurrency(log.cost, currency)}</TableCell></TableRow>)}
          </TableBody></Table></div>
          <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{copy.total.replace("{total}", String(callLogs.total))}</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={callPage <= 1} onClick={() => setCallPage((value) => value - 1)}>{copy.prev}</Button><span>{callPage} / {Math.max(1, Math.ceil(callLogs.total / callLogs.page_size))}</span><Button variant="outline" size="sm" disabled={callPage >= Math.max(1, Math.ceil(callLogs.total / callLogs.page_size))} onClick={() => setCallPage((value) => value + 1)}>{copy.next}</Button></div></div>
        </CardContent>
      </Card>
    </div>
  )
}

function humanAuditAction(action: string) {
  const labels: Record<string, string> = {
    organization_updated: "更新企业资料", portal_updated: "更新企业门户配置", portal_layout_updated: "更新门户布局",
    task_created: "创建任务", task_status_changed: "更新任务状态", task_participant_added: "添加任务参与人", task_participant_removed: "移除任务参与人", task_department_added: "添加任务部门", task_department_removed: "移除任务部门",
    budget_allocated: "分配组织预算", budget_reclaimed: "回收组织预算", budget_granted: "发放员工预算", personal_balance_allocated: "分配个人余额", quota_account_created: "登记预算账户",
    role_created: "创建权限组", role_updated: "更新权限组", role_granted: "授予权限组", role_revoked: "撤销权限组",
    member_created: "创建员工", member_updated: "更新员工", member_deleted: "移除员工", member_departments_updated: "更新员工部门",
    department_created: "创建部门", department_updated: "更新部门", department_deleted: "删除部门", department_roles_updated: "更新部门权限组",
    device_created: "登记企业设备", device_updated: "更新企业设备", device_deleted: "删除企业设备", device_assigned: "分配设备", device_assignment_revoked: "撤销设备分配", connector_command_created: "生成连接命令", connector_command_rotated: "更新连接命令",
    shared_pool_created: "创建共享资源池", pool_session_created: "在资源池中新建会话", pool_session_shared: "共享会话到资源池", pool_file_shared: "共享文件到资源池",
  }
  return labels[action] || action
}

function FilterInput({ label, value, placeholder, type = "text", onChange }: { label: string; value: string; placeholder?: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function DateFilterInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <DatePicker value={value} onValueChange={onChange} />
    </label>
  )
}

function cleanParams(params: Record<string, string | number>) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== ""))
}

function paginatedResult<T>(value: unknown, fallbackPage: number): PaginatedResult<T> {
  if (value && typeof value === "object" && Array.isArray((value as PaginatedResult<T>).items)) {
    const page = Number((value as PaginatedResult<T>).page || fallbackPage)
    const resolvedPageSize = Number((value as PaginatedResult<T>).page_size || pageSize)
    return { items: (value as PaginatedResult<T>).items, total: Number((value as PaginatedResult<T>).total || 0), page, page_size: resolvedPageSize }
  }
  return emptyPage<T>(fallbackPage)
}

function emptyPage<T>(page: number): PaginatedResult<T> {
  return { items: [], total: 0, page, page_size: pageSize }
}

function formatDateTime(value: string) {
  if (!value) return "-"
  return new Date(value).toLocaleString()
}

function formatPrice(value: string | number, currency: string) { const amount = Number(value || 0); return Number.isFinite(amount) && amount > 0 ? `${formatCurrency(amount.toLocaleString("en-US", { maximumFractionDigits: 8 }), currency)}/M` : "-" }
function formatMultiplier(value: string | number) { const amount = Number(value || 0); return Number.isFinite(amount) && amount > 0 ? amount.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "-" }
function formatLatency(value: number) { return value > 0 ? `${value} ms` : "-" }

function typeLabel(value: string, copy: typeof zhCopy) {
  switch (value) {
    case "login": return copy.typeLogin
    case "admin": return copy.typeAdmin
    case "system": return copy.typeSystem
    default: return copy.typeAPI
  }
}

function typeBadgeClass(value: string) {
  const base = "inline-flex rounded-full px-2 py-1 text-xs font-medium"
  switch (value) {
    case "login": return `${base} bg-blue-500/10 text-blue-600`
    case "admin": return `${base} bg-amber-500/10 text-amber-600`
    case "system": return `${base} bg-purple-500/10 text-purple-600`
    default: return `${base} bg-muted text-muted-foreground`
  }
}

function statusBadgeClass(status: number) {
  const base = "inline-flex rounded-full px-2 py-1 text-xs font-medium"
  if (status >= 500) return `${base} bg-red-500/10 text-red-600`
  if (status >= 400) return `${base} bg-amber-500/10 text-amber-600`
  if (status >= 200 && status < 400) return `${base} bg-green-500/10 text-green-600`
  return `${base} bg-muted text-muted-foreground`
}

const zhCopy = {
  title: "日志查看",
  subtitle: "查看 API 调用、登录、管理修改和系统日志",
  filters: "筛选",
  logs: "审计日志",
  type: "类型",
  allTypes: "全部类型",
  typeAPI: "API 调用",
  typeLogin: "登录",
  typeAdmin: "管理修改",
  typeSystem: "系统",
  startDate: "开始日期",
  endDate: "结束日期",
  statusCode: "状态码",
  action: "动作",
  path: "路径",
  userID: "用户 ID",
  reset: "重置",
  time: "时间",
  user: "用户",
  request: "请求",
  ip: "IP",
  duration: "耗时",
  message: "消息 / User-Agent",
  loading: "加载中...",
  empty: "暂无日志",
  total: "共 {total} 条",
  prev: "上一页",
  next: "下一页",
}

const enCopy = {
  title: "Audit Logs",
  subtitle: "View API access, login, admin change, and system logs",
  filters: "Filters",
  logs: "Audit Logs",
  type: "Type",
  allTypes: "All types",
  typeAPI: "API",
  typeLogin: "Login",
  typeAdmin: "Admin Change",
  typeSystem: "System",
  startDate: "Start date",
  endDate: "End date",
  statusCode: "Status",
  action: "Action",
  path: "Path",
  userID: "User ID",
  reset: "Reset",
  time: "Time",
  user: "User",
  request: "Request",
  ip: "IP",
  duration: "Duration",
  message: "Message / User-Agent",
  loading: "Loading...",
  empty: "No logs",
  total: "{total} total",
  prev: "Prev",
  next: "Next",
}
