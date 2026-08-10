import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LifeBuoy, Loader2, MessageSquarePlus, Plus, RefreshCw, Send, XCircle } from "lucide-react"
import api from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { HCaptcha } from "@/components/HCaptcha"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"

type TicketStatus = "open" | "pending" | "answered" | "closed"
type TicketPriority = "low" | "normal" | "high" | "urgent"

interface TicketUser { id: number; username: string; email: string }
interface TicketMessage { id: number; ticket_id: number; user_id: number; is_staff: boolean; content: string; created_at: string; author: TicketUser }
interface Ticket { id: number; user_id: number; subject: string; category: string; priority: TicketPriority; status: TicketStatus; closed_at?: string; created_at: string; updated_at: string; requester: TicketUser; messages?: TicketMessage[] }
interface TicketsResponse { tickets: Ticket[] }
interface TicketResponse { ticket: Ticket }
interface TicketCategory { id: number; slug: string; name: string }
interface TicketCategoriesResponse { categories: TicketCategory[] }
export default function Tickets() {
  const client = useQueryClient()
  const { success, error } = useToast()
  const [selectedID, setSelectedID] = useState<number | null>(null)
  const [subject, setSubject] = useState("")
  const [category, setCategory] = useState("general")
  const [priority, setPriority] = useState<TicketPriority>("normal")
  const [content, setContent] = useState("")
  const [reply, setReply] = useState("")
  const [captchaToken, setCaptchaToken] = useState("")
  const [captchaResetKey, setCaptchaResetKey] = useState(0)

  const { data: settings } = useQuery<PublicSettings>({ queryKey: ["public-settings"], queryFn: async () => (await api.get("/public/settings")).data })
  const publicSettings = withPublicSettingsDefaults(settings)
  const captchaEnabled = publicSettings.password_hcaptcha_enabled && Boolean(publicSettings.hcaptcha_site_key)
  const ticketsKey = ["tickets", "mine"] as const
  const tickets = useQuery<TicketsResponse>({
    queryKey: ticketsKey,
    queryFn: async () => (await api.get("/user/tickets")).data,
  })
  const { data: categoryData } = useQuery<TicketCategoriesResponse>({ queryKey: ["ticket-categories"], queryFn: async () => (await api.get("/user/ticket-categories")).data })
  const categories = categoryData?.categories || []
  useEffect(() => { if (categories.length > 0 && !categories.some((item) => item.slug === category)) setCategory(categories[0].slug) }, [categories, category])

  useEffect(() => {
    if (selectedID === null && tickets.data?.tickets[0]) setSelectedID(tickets.data.tickets[0].id)
  }, [selectedID, tickets.data?.tickets])

  const detail = useQuery<TicketResponse>({
    queryKey: ["ticket", "mine", selectedID],
    queryFn: async () => (await api.get(`/user/tickets/${selectedID}`)).data,
    enabled: selectedID !== null,
  })
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ticketsKey })
    if (selectedID !== null) void client.invalidateQueries({ queryKey: ["ticket", "mine", selectedID] })
  }

  const create = useMutation({
    mutationFn: async () => api.post("/user/tickets", { subject, category, priority, content, captcha_token: captchaToken }),
    onSuccess: (response) => {
      const created = (response.data as TicketResponse).ticket
      setSubject("")
      setContent("")
      setCategory(categories[0]?.slug || "")
      setPriority("normal")
      setCaptchaToken("")
      setCaptchaResetKey((value) => value + 1)
      setSelectedID(created.id)
      invalidate()
      success("工单已提交")
    },
    onError: (value: unknown) => error(errorMessage(value, "提交工单失败")),
  })
  const addReply = useMutation({
    mutationFn: async () => api.post(`/user/tickets/${selectedID}/messages`, { content: reply }),
    onSuccess: () => { setReply(""); invalidate(); success("补充说明已发送") },
    onError: (value: unknown) => error(errorMessage(value, "发送失败")),
  })
  const close = useMutation({
    mutationFn: async () => api.post(`/user/tickets/${selectedID}/close`),
    onSuccess: () => { invalidate(); success("工单已关闭") },
    onError: (value: unknown) => error(errorMessage(value, "关闭工单失败")),
  })
  const allTickets = tickets.data?.tickets || []
  const stats = useMemo(() => ({ open: allTickets.filter((ticket) => ticket.status === "open" || ticket.status === "pending").length, answered: allTickets.filter((ticket) => ticket.status === "answered").length, closed: allTickets.filter((ticket) => ticket.status === "closed").length }), [allTickets])
  const selected = detail.data?.ticket

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><div className="flex items-center gap-2"><LifeBuoy className="size-5 text-primary" /><h1 className="text-2xl font-semibold">工单</h1></div><p className="mt-1 text-sm text-muted-foreground">提交问题、补充信息，并跟进处理进度。</p></div>
      <Button variant="outline" onClick={() => void tickets.refetch()} disabled={tickets.isFetching}>{tickets.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}<span>刷新</span></Button>
    </div>

    <div className="grid gap-3 sm:grid-cols-3"><Metric label="处理中" value={stats.open} /><Metric label="待回复" value={stats.answered} /><Metric label="已关闭" value={stats.closed} /></div>

    <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.65fr)]">
      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquarePlus className="size-4" />提交工单</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} placeholder="问题标题" />
            <div className="grid grid-cols-2 gap-3">
              <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-full"><SelectValue placeholder="类型" /></SelectTrigger><SelectContent>{categories.map((item) => <SelectItem key={item.id} value={item.slug}>{item.name}</SelectItem>)}</SelectContent></Select>
              <Select value={priority} onValueChange={(value) => setPriority(value as TicketPriority)}><SelectTrigger className="w-full"><SelectValue placeholder="优先级" /></SelectTrigger><SelectContent><SelectItem value="low">低</SelectItem><SelectItem value="normal">普通</SelectItem><SelectItem value="high">高</SelectItem><SelectItem value="urgent">紧急</SelectItem></SelectContent></Select>
            </div>
            <Textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={5000} className="min-h-28" placeholder="请尽可能描述问题、复现步骤和已尝试的处理方式。" />
            {captchaEnabled && <HCaptcha siteKey={publicSettings.hcaptcha_site_key} onToken={setCaptchaToken} resetKey={captchaResetKey} />}
            <Button className="w-full" disabled={!subject.trim() || !content.trim() || !category || (captchaEnabled && !captchaToken) || create.isPending} onClick={() => create.mutate()}>{create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}提交工单</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">我的工单</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {tickets.isLoading ? <Loading /> : allTickets.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">暂无工单</p> : allTickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => setSelectedID(ticket.id)} className={cn("w-full rounded-lg border p-3 text-left transition-colors", selectedID === ticket.id ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
              <div className="flex items-start justify-between gap-2"><span className="min-w-0 truncate font-medium">{ticket.subject}</span><StatusBadge status={ticket.status} /></div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{categoryLabel(ticket.category, categories)}</span><span>{formatDate(ticket.updated_at)}</span></div>
            </button>)}
          </CardContent>
        </Card>
      </div>

      <Card className="min-h-125">
        {!selectedID ? <CardContent className="flex min-h-125 items-center justify-center text-sm text-muted-foreground">选择一张工单查看详情</CardContent> : detail.isLoading ? <CardContent className="flex min-h-125 items-center justify-center"><Loading /></CardContent> : selected ? <>
          <CardHeader className="border-b">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CardTitle className="break-words">{selected.subject}</CardTitle><StatusBadge status={selected.status} /><PriorityBadge priority={selected.priority} /></div><p className="mt-1 text-sm text-muted-foreground">#{selected.id} · {categoryLabel(selected.category, categories)} · 创建于 {formatDate(selected.created_at)}</p></div>{selected.status !== "closed" && <Button variant="outline" size="sm" disabled={close.isPending} onClick={() => close.mutate()}><XCircle />关闭工单</Button>}</div>
          </CardHeader>
          <CardContent className="flex min-h-100 flex-col gap-4">
            <div className="flex-1 space-y-4">{selected.messages?.map((message) => <article key={message.id} className={cn("max-w-[90%] rounded-lg border px-3 py-2.5", message.is_staff ? "mr-auto bg-primary/5" : "ml-auto bg-muted/60")}><div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{message.is_staff ? "客服" : requesterName(message.author)}</span><time>{formatDate(message.created_at)}</time></div><p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p></article>)}</div>
            {selected.status !== "closed" && <div className="border-t pt-4"><Textarea value={reply} onChange={(event) => setReply(event.target.value)} maxLength={5000} className="min-h-24" placeholder="补充问题信息..." /><div className="mt-3 flex justify-end"><Button disabled={!reply.trim() || addReply.isPending} onClick={() => addReply.mutate()}>{addReply.isPending ? <Loader2 className="animate-spin" /> : <Send />}补充说明</Button></div></div>}
          </CardContent>
        </> : <CardContent className="flex min-h-125 items-center justify-center text-sm text-muted-foreground">无法加载工单详情</CardContent>}
      </Card>
    </div>
  </div>
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border bg-card p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div> }
function Loading() { return <Loader2 className="size-5 animate-spin text-muted-foreground" /> }
function StatusBadge({ status }: { status: TicketStatus }) { const labels: Record<TicketStatus, string> = { open: "待处理", pending: "处理中", answered: "已回复", closed: "已关闭" }; const classes: Record<TicketStatus, string> = { open: "bg-blue-500/10 text-blue-700", pending: "bg-amber-500/10 text-amber-700", answered: "bg-emerald-500/10 text-emerald-700", closed: "bg-muted text-muted-foreground" }; return <Badge className={cn("border-0", classes[status])}>{labels[status]}</Badge> }
function PriorityBadge({ priority }: { priority: TicketPriority }) { const labels: Record<TicketPriority, string> = { low: "低", normal: "普通", high: "高", urgent: "紧急" }; const classes: Record<TicketPriority, string> = { low: "text-muted-foreground", normal: "text-foreground", high: "text-amber-700", urgent: "text-destructive" }; return <span className={cn("text-xs font-medium", classes[priority])}>{labels[priority]}优先级</span> }
function categoryLabel(value: string, categories: TicketCategory[]) { return categories.find((item) => item.slug === value)?.name || value }
function requesterName(user: TicketUser) { return user.username || user.email || `用户 #${user.id}` }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date) }
function errorMessage(value: unknown, fallback: string) { const candidate = value as { response?: { data?: { error?: string } } }; return candidate.response?.data?.error || fallback }
