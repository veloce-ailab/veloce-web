import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import { PageTab, PageTabs } from "@/components/layout/PageTabs"
import { TabTransition } from "@/components/layout/TabTransition"
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
import type { PublicSettings } from "@/lib/public-settings"
import { isPersonalMode, withPublicSettingsDefaults } from "@/lib/public-settings"
import { formatCurrency } from "@/lib/currency"

interface TokenLog {
  id: number
  created_at: string
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
  cache_write_input_price: string | number
  cache_write_1h_input_price: string | number
  pricing_formula: string
  cost: string | number
  // status 为 0 表示成功；上级调用失败时为返回的 HTTP 状态码（该行不计费）
  status?: number
  error_message?: string
}

interface APIKeyOption {
  id: number
  name: string
  key_prefix: string
}

interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

interface PaymentOrder {
  order_no: string
  amount: string
  rmb_amount: string
  method: string
  status: string
  created_at?: string
  paid_at?: string
}

interface CheckInRecord {
  check_in_date: string
  reward_amount: string
  streak_days: number
  reward_kind: string
}

type DetailTab = "calls" | "payments" | "checkIns"

const pageSize = 20
const emptyTableQuery = (): TableQuery => ({ filters: {} })

export default function Logs() {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhDetailsCopy : enDetailsCopy
  const [activeTab, setActiveTab] = useState<DetailTab>("calls")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [apiKeyID, setAPIKeyID] = useState("")
  const [callPage, setCallPage] = useState(1)
  const [paymentPage, setPaymentPage] = useState(1)
  const [checkInPage, setCheckInPage] = useState(1)
  const [callTableQuery, setCallTableQuery] = useState<TableQuery>(emptyTableQuery)
  const [paymentTableQuery, setPaymentTableQuery] = useState<TableQuery>(emptyTableQuery)
  const [checkInTableQuery, setCheckInTableQuery] = useState<TableQuery>(emptyTableQuery)
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const personalMode = isPersonalMode(publicSettings)
  const currency = publicSettings.payment_currency_display_name
  const tabOrder: DetailTab[] = personalMode ? ["calls", "checkIns"] : ["calls", "payments", "checkIns"]

  useEffect(() => {
    if (personalMode && activeTab === "payments") {
      setActiveTab("calls")
    }
  }, [activeTab, personalMode])

  const { data: apiKeys = [] } = useQuery<APIKeyOption[]>({
    queryKey: ["api-keys", "log-filters"],
    queryFn: async () => {
      const res = await api.get("/user/api-keys")
      return Array.isArray(res.data) ? res.data.map(normalizeAPIKeyOption) : []
    },
  })
  const { data: logs = emptyPage<TokenLog>(callPage), isLoading: isLogsLoading } = useQuery<PaginatedResult<TokenLog>>({
    queryKey: ["logs", "user", "paged", callPage, startDate, endDate, apiKeyID, callTableQuery],
    queryFn: async () => {
      const res = await api.get("/user/logs", { params: { ...logQueryParams(callPage, startDate, endDate, apiKeyID), ...tableQueryParams(callTableQuery) } })
      return paginatedResult<TokenLog>(res.data, callPage)
    },
  })
  const { data: paymentOrders = emptyPage<PaymentOrder>(paymentPage), isLoading: isPaymentOrdersLoading } = useQuery<PaginatedResult<PaymentOrder>>({
    queryKey: ["payment-orders", "paged", paymentPage, startDate, endDate, paymentTableQuery],
    queryFn: async () => {
      const res = await api.get("/user/payment/orders", { params: { ...pageQueryParams(paymentPage, startDate, endDate), ...tableQueryParams(paymentTableQuery) } })
      return paginatedResult<PaymentOrder>(res.data, paymentPage)
    },
    enabled: !personalMode,
  })
  const { data: checkInRecords = emptyPage<CheckInRecord>(checkInPage), isLoading: isCheckInRecordsLoading } = useQuery<PaginatedResult<CheckInRecord>>({
    queryKey: ["check-in-records", "paged", checkInPage, startDate, endDate, checkInTableQuery],
    queryFn: async () => {
      const res = await api.get("/user/check-in/records", { params: { ...pageQueryParams(checkInPage, startDate, endDate), ...tableQueryParams(checkInTableQuery) } })
      return paginatedResult<CheckInRecord>(res.data, checkInPage)
    },
  })

  const resetFilters = () => {
    setStartDate("")
    setEndDate("")
    setAPIKeyID("")
    setCallPage(1)
    setPaymentPage(1)
    setCheckInPage(1)
    setCallTableQuery(emptyTableQuery())
    setPaymentTableQuery(emptyTableQuery())
    setCheckInTableQuery(emptyTableQuery())
  }

  const setDateFilter = (field: "start" | "end", value: string) => {
    if (field === "start") {
      setStartDate(value)
    } else {
      setEndDate(value)
    }
    setCallPage(1)
    setPaymentPage(1)
    setCheckInPage(1)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{copy.title}</h1>
        <div className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</div>
      </div>

      <PageTitleSlot />
      <PageTabs aria-label={copy.title}>
        <PageTab active={activeTab === "calls"} onClick={() => setActiveTab("calls")}>
          {copy.callRecords}
        </PageTab>
        {!personalMode && (
          <PageTab active={activeTab === "payments"} onClick={() => setActiveTab("payments")}>
            {copy.paymentOrders}
          </PageTab>
        )}
        <PageTab active={activeTab === "checkIns"} onClick={() => setActiveTab("checkIns")}>
          {copy.checkInRecords}
        </PageTab>
      </PageTabs>

      <PageInlineSlot slotKey="primary" />
      <TabTransition activeKey={activeTab} order={tabOrder}>
        {activeTab === "calls" && (
          <CallRecordsTable
            logs={logs}
            loading={isLogsLoading}
            t={t}
            copy={copy}
            currency={currency}
            apiKeys={apiKeys}
            startDate={startDate}
            endDate={endDate}
            apiKeyID={apiKeyID}
            onStartDateChange={(value) => setDateFilter("start", value)}
            onEndDateChange={(value) => setDateFilter("end", value)}
            onAPIKeyChange={(value) => {
              setAPIKeyID(value)
              setCallPage(1)
            }}
            onReset={resetFilters}
            onPageChange={setCallPage}
            onQueryChange={(query) => { setCallTableQuery(query); setCallPage(1) }}
          />
        )}
        {!personalMode && activeTab === "payments" && (
          <PaymentOrdersTable
            orders={paymentOrders}
            loading={isPaymentOrdersLoading}
            copy={copy}
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={(value) => setDateFilter("start", value)}
            onEndDateChange={(value) => setDateFilter("end", value)}
            onReset={resetFilters}
            onPageChange={setPaymentPage}
            onQueryChange={(query) => { setPaymentTableQuery(query); setPaymentPage(1) }}
          />
        )}
        {activeTab === "checkIns" && (
          <CheckInRecordsTable
            records={checkInRecords}
            loading={isCheckInRecordsLoading}
            copy={copy}
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={(value) => setDateFilter("start", value)}
            onEndDateChange={(value) => setDateFilter("end", value)}
            onReset={resetFilters}
            onPageChange={setCheckInPage}
            onQueryChange={(query) => { setCheckInTableQuery(query); setCheckInPage(1) }}
          />
        )}
      </TabTransition>
      <PageInlineSlot slotKey="secondary" />
    </div>
  )
}

function CallRecordsTable({
  logs,
  loading,
  t,
  copy,
  currency,
  apiKeys,
  startDate,
  endDate,
  apiKeyID,
  onStartDateChange,
  onEndDateChange,
  onAPIKeyChange,
  onReset,
  onPageChange,
  onQueryChange,
}: {
  logs: PaginatedResult<TokenLog>
  loading: boolean
  t: ReturnType<typeof useI18n>["t"]
  copy: typeof zhDetailsCopy
  currency: string
  apiKeys: APIKeyOption[]
  startDate: string
  endDate: string
  apiKeyID: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onAPIKeyChange: (value: string) => void
  onReset: () => void
  onPageChange: (page: number) => void
  onQueryChange: (query: TableQuery) => void
}) {
  return (
    <div className="space-y-3">
      <DetailFilters
        copy={copy}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        onReset={onReset}
        extra={
          <label className="min-w-48 flex-1 space-y-1 text-sm">
            <span className="text-muted-foreground">{copy.apiKeyFilter}</span>
            <Select value={String((apiKeyID) || "__shadcn_empty__")} onValueChange={(value) => onAPIKeyChange((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-input bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="__shadcn_empty__">{copy.allAPIKeys}</SelectItem>
              {apiKeys.map((key) => (
                <SelectItem key={key.id} value={String(key.id)}>
                  {key.name || copy.apiKeyFallback} {key.key_prefix ? `(${key.key_prefix})` : ""}
                </SelectItem>
              ))}
            </SelectContent></Select>
          </label>
        }
      />
      <div className="overflow-x-auto rounded-md border">
        <Table onQueryChange={onQueryChange}>
          <TableHeader>
            <TableRow>
              <TableHead sortKey="created_at">{t("common.time")}</TableHead>
              <TableHead queryKey="api_key_id">{t("usage.apiKey")}</TableHead>
              <TableHead sortKey="channel_id">{t("usage.userChannel")} / {t("usage.upstreamChannel")}</TableHead>
              <TableHead queryKey="model_name">{t("common.model")}</TableHead>
              <TableHead sortKey="total_tokens">{t("common.tokens")}</TableHead>
              <TableHead sortKey="input_price">{copy.pricing}</TableHead>
              <TableHead sortKey="group_multiplier">{copy.multipliers}</TableHead>
              <TableHead sortKey="pricing_formula">{copy.formula}</TableHead>
              <TableHead sortKey="response_time_ms">{copy.performance}</TableHead>
              <TableHead sortKey="cost">{t("common.cost")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : logs.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                  {t("usage.noUsage")}
                </TableCell>
              </TableRow>
            ) : (
              logs.items.map((log) => {
                const failed = (log.status || 0) >= 400
                return (
                <TableRow key={log.id} className={failed ? "bg-destructive/5" : undefined}>
                  <TableCell>{formatDateTime(log.created_at)}</TableCell>
                  <TableCell>{log.api_key_id || "-"}</TableCell>
                  <TableCell>{log.user_channel_id || "-"} / {log.channel_id}</TableCell>
                  <TableCell>
                    <span className="whitespace-nowrap">{log.model_name}</span>
                    {failed && (
                      <span
                        className="ml-1.5 inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
                        title={log.error_message || undefined}
                      >
                        {copy.failed} {log.status}
                      </span>
                    )}
                    {failed && log.error_message && (
                      <div className="mt-0.5 max-w-64 truncate text-xs text-muted-foreground" title={log.error_message}>
                        {log.error_message}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">in {log.input_tokens} · out {log.output_tokens}<br /><span className="text-xs text-muted-foreground">cache {log.cached_input_tokens || 0} / write {log.cache_write_input_tokens || 0} / 1h {log.cache_write_1h_input_tokens || 0}</span></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">in {formatPrice(log.input_price, currency)}<br />out {formatPrice(log.output_price, currency)}<br />cache {formatPrice(log.cached_input_price, currency)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">组 {formatDecimal(log.group_multiplier)}×<br />通道 {formatDecimal(log.user_channel_multiplier)}×</TableCell>
                  <TableCell className="max-w-80 truncate text-xs" title={log.pricing_formula}>{log.pricing_formula || "-"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">FRT {formatLatency(log.first_response_time_ms)}<br />总计 {formatLatency(log.response_time_ms)}</TableCell>
                  <TableCell>{failed ? <span className="text-muted-foreground">{copy.notBilled}</span> : formatCurrency(log.cost, currency)}</TableCell>
                </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
      <PaginationControls page={logs.page} pageSize={logs.page_size} total={logs.total} copy={copy} onPageChange={onPageChange} />
    </div>
  )
}

function PaymentOrdersTable({
  orders,
  loading,
  copy,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onReset,
  onPageChange,
  onQueryChange,
}: {
  orders: PaginatedResult<PaymentOrder>
  loading: boolean
  copy: typeof zhDetailsCopy
  startDate: string
  endDate: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onReset: () => void
  onPageChange: (page: number) => void
  onQueryChange: (query: TableQuery) => void
}) {
  return (
    <div className="space-y-3">
      <DetailFilters
        copy={copy}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        onReset={onReset}
      />
      <div className="overflow-x-auto rounded-md border">
        <Table onQueryChange={onQueryChange}>
          <TableHeader>
            <TableRow>
              <TableHead queryKey="order_no">{copy.orderNo}</TableHead>
              <TableHead queryKey="amount">{copy.amount}</TableHead>
              <TableHead queryKey="rmb_amount">{copy.rmbAmount}</TableHead>
              <TableHead sortKey="method">{copy.method}</TableHead>
              <TableHead sortKey="status">{copy.status}</TableHead>
              <TableHead sortKey="created_at">{copy.createdAt}</TableHead>
              <TableHead sortKey="paid_at">{copy.paidAt}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{copy.loading}</TableCell></TableRow>
            ) : orders.items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{copy.noPaymentOrders}</TableCell></TableRow>
            ) : (
              orders.items.map((order) => (
                <TableRow key={order.order_no}>
                  <TableCell className="font-mono text-xs">{order.order_no}</TableCell>
                  <TableCell>{order.amount}</TableCell>
                  <TableCell>{order.rmb_amount}</TableCell>
                  <TableCell>{paymentMethodLabel(order.method, copy)}</TableCell>
                  <TableCell>{paymentStatusLabel(order.status, copy)}</TableCell>
                  <TableCell>{order.created_at ? formatDateTime(order.created_at) : "-"}</TableCell>
                  <TableCell>{order.paid_at ? formatDateTime(order.paid_at) : "-"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <PaginationControls page={orders.page} pageSize={orders.page_size} total={orders.total} copy={copy} onPageChange={onPageChange} />
    </div>
  )
}

function CheckInRecordsTable({
  records,
  loading,
  copy,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onReset,
  onPageChange,
  onQueryChange,
}: {
  records: PaginatedResult<CheckInRecord>
  loading: boolean
  copy: typeof zhDetailsCopy
  startDate: string
  endDate: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onReset: () => void
  onPageChange: (page: number) => void
  onQueryChange: (query: TableQuery) => void
}) {
  return (
    <div className="space-y-3">
      <DetailFilters
        copy={copy}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        onReset={onReset}
      />
      <div className="overflow-x-auto rounded-md border">
        <Table onQueryChange={onQueryChange}>
          <TableHeader>
            <TableRow>
              <TableHead queryKey="check_in_date">{copy.date}</TableHead>
              <TableHead queryKey="reward_amount">{copy.reward}</TableHead>
              <TableHead sortKey="streak_days">{copy.streak}</TableHead>
              <TableHead sortKey="reward_kind">{copy.rewardKind}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">{copy.loading}</TableCell></TableRow>
            ) : records.items.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">{copy.noCheckInRecords}</TableCell></TableRow>
            ) : (
              records.items.map((record) => (
                <TableRow key={record.check_in_date}>
                  <TableCell>{record.check_in_date}</TableCell>
                  <TableCell>{record.reward_amount}</TableCell>
                  <TableCell>{copy.streakDays.replace("{days}", String(record.streak_days))}</TableCell>
                  <TableCell>{rewardKindLabel(record.reward_kind, copy)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <PaginationControls page={records.page} pageSize={records.page_size} total={records.total} copy={copy} onPageChange={onPageChange} />
    </div>
  )
}

function DetailFilters({
  copy,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onReset,
  extra,
}: {
  copy: typeof zhDetailsCopy
  startDate: string
  endDate: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onReset: () => void
  extra?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-card p-3 md:flex-row md:items-end">
      <label className="min-w-40 flex-1 space-y-1 text-sm">
        <span className="text-muted-foreground">{copy.startDate}</span>
        <DatePicker value={startDate} onValueChange={onStartDateChange} />
      </label>
      <label className="min-w-40 flex-1 space-y-1 text-sm">
        <span className="text-muted-foreground">{copy.endDate}</span>
        <DatePicker value={endDate} onValueChange={onEndDateChange} />
      </label>
      {extra}
      <Button variant="outline" onClick={onReset}>{copy.resetFilters}</Button>
    </div>
  )
}

function PaginationControls({
  page,
  pageSize,
  total,
  copy,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  copy: typeof zhDetailsCopy
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <div>
        {copy.pageSummary
          .replace("{page}", String(page))
          .replace("{totalPages}", String(totalPages))
          .replace("{total}", String(total))}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          {copy.previousPage}
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          {copy.nextPage}
        </Button>
      </div>
    </div>
  )
}

function pageQueryParams(page: number, startDate: string, endDate: string) {
  return {
    page,
    page_size: pageSize,
    ...(startDate ? { start_time: startDate } : {}),
    ...(endDate ? { end_time: endDate } : {}),
  }
}

function logQueryParams(page: number, startDate: string, endDate: string, apiKeyID: string) {
  return {
    ...pageQueryParams(page, startDate, endDate),
    ...(apiKeyID ? { api_key_id: apiKeyID } : {}),
  }
}

function paginatedResult<T>(data: unknown, page: number): PaginatedResult<T> {
  if (Array.isArray(data)) {
    return { items: data as T[], total: data.length, page, page_size: pageSize }
  }
  if (data && typeof data === "object") {
    const item = data as { items?: unknown; total?: unknown; page?: unknown; page_size?: unknown }
    return {
      items: Array.isArray(item.items) ? item.items as T[] : [],
      total: typeof item.total === "number" ? item.total : 0,
      page: typeof item.page === "number" ? item.page : page,
      page_size: typeof item.page_size === "number" ? item.page_size : pageSize,
    }
  }
  return emptyPage<T>(page)
}

function emptyPage<T>(page: number): PaginatedResult<T> {
  return { items: [], total: 0, page, page_size: pageSize }
}

function normalizeAPIKeyOption(value: unknown): APIKeyOption {
  const item = value && typeof value === "object" ? value as Partial<APIKeyOption> : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    key_prefix: typeof item.key_prefix === "string" ? item.key_prefix : "",
  }
}

function paymentMethodLabel(method: string, copy: typeof zhDetailsCopy) {
  switch (method.toLowerCase()) {
    case "alipay":
      return copy.alipay
    case "wxpay":
      return copy.wxpay
    default:
      return method
  }
}

function paymentStatusLabel(status: string, copy: typeof zhDetailsCopy) {
  switch (status.toLowerCase()) {
    case "paid":
      return copy.paid
    case "pending":
      return copy.pending
    default:
      return status || "-"
  }
}

function rewardKindLabel(kind: string, copy: typeof zhDetailsCopy) {
  if (!kind) {
    return "-"
  }
  return kind
    .split("_")
    .map((item) => {
      switch (item) {
        case "daily":
          return copy.rewardDaily
        case "streak":
          return copy.rewardStreak
        case "random":
          return copy.rewardRandom
        default:
          return item
      }
    })
    .join(" + ")
}

function formatDateTime(value: string) {
  if (!value) {
    return "-"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

function formatPrice(value: string | number | undefined, currency: string) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) && parsed > 0 ? `${formatCurrency(parsed.toLocaleString("en-US", { maximumFractionDigits: 8 }), currency)}/M` : "-"
}

function formatDecimal(value: string | number | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "-"
}

function formatLatency(value: number | undefined) {
  return value && value > 0 ? `${value} ms` : "-"
}

const zhDetailsCopy = {
  title: "明细",
  subtitle: "集中查看调用、充值和签到等账户明细",
  callRecords: "调用记录",
  paymentOrders: "充值订单",
  checkInRecords: "签到记录",
  orderNo: "订单号",
  amount: "金额",
  rmbAmount: "人民币金额",
  method: "支付方式",
  status: "状态",
  createdAt: "创建时间",
  paidAt: "支付时间",
  noPaymentOrders: "暂无充值订单",
  date: "日期",
  reward: "奖励",
  streak: "连续天数",
  rewardKind: "奖励类型",
  noCheckInRecords: "暂无签到记录",
  streakDays: "连续 {days} 天",
  loading: "加载中...",
  startDate: "开始日期",
  endDate: "结束日期",
  resetFilters: "重置",
  apiKeyFilter: "API Key",
  allAPIKeys: "全部 API Key",
  apiKeyFallback: "API Key",
  pricing: "价格（每百万 token）",
  multipliers: "倍率",
  formula: "计费算式",
  performance: "性能",
  failed: "失败",
  notBilled: "未计费",
  previousPage: "上一页",
  nextPage: "下一页",
  pageSummary: "第 {page} / {totalPages} 页，共 {total} 条",
  alipay: "支付宝",
  wxpay: "微信支付",
  paid: "已支付",
  pending: "待支付",
  rewardDaily: "每日",
  rewardStreak: "连续",
  rewardRandom: "随机",
}

const enDetailsCopy: typeof zhDetailsCopy = {
  title: "Details",
  subtitle: "Review call, recharge, and check-in account details",
  callRecords: "Call records",
  paymentOrders: "Payment orders",
  checkInRecords: "Check-in records",
  orderNo: "Order no.",
  amount: "Amount",
  rmbAmount: "RMB amount",
  method: "Method",
  status: "Status",
  createdAt: "Created at",
  paidAt: "Paid at",
  noPaymentOrders: "No payment orders",
  date: "Date",
  reward: "Reward",
  streak: "Streak",
  rewardKind: "Reward type",
  noCheckInRecords: "No check-in records",
  streakDays: "{days} day streak",
  loading: "Loading...",
  startDate: "Start date",
  endDate: "End date",
  resetFilters: "Reset",
  apiKeyFilter: "API key",
  allAPIKeys: "All API keys",
  apiKeyFallback: "API key",
  pricing: "Prices (per 1M tokens)",
  multipliers: "Multipliers",
  formula: "Billing formula",
  performance: "Performance",
  failed: "Failed",
  notBilled: "Not billed",
  previousPage: "Previous",
  nextPage: "Next",
  pageSummary: "Page {page} of {totalPages}, {total} records",
  alipay: "Alipay",
  wxpay: "WeChat Pay",
  paid: "Paid",
  pending: "Pending",
  rewardDaily: "Daily",
  rewardStreak: "Streak",
  rewardRandom: "Random",
}
