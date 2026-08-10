import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Code2,
  CreditCard,
  Database,
  DollarSign,
  ExternalLink,
  FileText,
  Globe2,
  Heading1,
  ImageIcon,
  Images,
  KeyRound,
  LineChart,
  Megaphone,
  MousePointerClick,
  Music2,
  Server,
  Sparkles,
  UserCircle,
  WalletCards,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { PageComponentConfig, PageComponentItem, PageComponentWidth } from "@/lib/page-layouts"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"
import { cn } from "@/lib/utils"

interface CurrentUser {
  username?: string
  email?: string
  balance?: string | number
}

interface UserStats {
  balance: string | number
  total_requests: number
  today_requests: number
  total_cost: string | number
  rpm: number
  tpm: number
}

interface Announcement {
  id: number
  title: string
  content: string
  created_at: string
}

interface PublicStatusMonitor {
  id: number
  name: string
  status: string
  latency_ms: number
  last_checked_at?: string | null
  uptime: number
}

interface PublicStatusResponse {
  monitors: PublicStatusMonitor[]
}

interface StatCard {
  title: string
  value: string | number
  icon: LucideIcon
  color: string
}

interface PageComponentPreset {
  type: string
  label: {
    zh: string
    en: string
  }
  description: {
    zh: string
    en: string
  }
  defaultWidth: PageComponentWidth
  icon: LucideIcon
}

export const pageComponentPresets: PageComponentPreset[] = [
  {
    type: "dashboard_stats",
    label: { zh: "用户统计", en: "User stats" },
    description: { zh: "余额、请求量、速率和总成本。", en: "Balance, requests, rate, and total cost." },
    defaultWidth: "full",
    icon: BarChart3,
  },
  {
    type: "announcements",
    label: { zh: "公告列表", en: "Announcements" },
    description: { zh: "展示启用的用户公告。", en: "Shows enabled user announcements." },
    defaultWidth: "half",
    icon: Megaphone,
  },
  {
    type: "node_status",
    label: { zh: "节点状态", en: "Node status" },
    description: { zh: "展示公开监控节点的可用性。", en: "Shows public monitor availability." },
    defaultWidth: "half",
    icon: Server,
  },
  {
    type: "account_summary",
    label: { zh: "账户概览", en: "Account summary" },
    description: { zh: "展示当前账户和用量摘要。", en: "Shows the current account and usage summary." },
    defaultWidth: "third",
    icon: UserCircle,
  },
  {
    type: "quick_links",
    label: { zh: "快捷入口", en: "Quick links" },
    description: { zh: "提供聊天、密钥、钱包等常用入口。", en: "Links to chat, API keys, wallet, and details." },
    defaultWidth: "third",
    icon: ArrowRight,
  },
  {
    type: "custom_html",
    label: { zh: "HTML 小组件", en: "HTML widget" },
    description: { zh: "运行管理员填写的 HTML 片段。", en: "Runs an admin-provided HTML snippet." },
    defaultWidth: "full",
    icon: Code2,
  },
  {
    type: "iframe",
    label: { zh: "iframe 小组件", en: "Iframe widget" },
    description: { zh: "嵌入一个外部或站内页面。", en: "Embeds an external or internal page." },
    defaultWidth: "full",
    icon: Globe2,
  },
  {
    type: "title_bar",
    label: { zh: "标题栏", en: "Title bar" },
    description: { zh: "页面内标题、说明和强调标签。", en: "A page title, subtitle, and accent label." },
    defaultWidth: "full",
    icon: Heading1,
  },
  {
    type: "image_box",
    label: { zh: "图片框", en: "Image box" },
    description: { zh: "展示一张图片，可附带标题、说明和链接。", en: "Shows one image with optional text and link." },
    defaultWidth: "half",
    icon: ImageIcon,
  },
  {
    type: "image_marquee",
    label: { zh: "滚动图片框", en: "Image marquee" },
    description: { zh: "横向循环展示多张图片。", en: "Loops a row of images horizontally." },
    defaultWidth: "full",
    icon: Images,
  },
  {
    type: "text_box",
    label: { zh: "自定义文本框", en: "Text box" },
    description: { zh: "展示管理员编写的多行文本。", en: "Displays admin-authored multiline text." },
    defaultWidth: "half",
    icon: FileText,
  },
  {
    type: "clock",
    label: { zh: "时钟", en: "Clock" },
    description: { zh: "显示当前时间，可配置时区。", en: "Shows the current time with an optional timezone." },
    defaultWidth: "third",
    icon: Clock,
  },
  {
    type: "music_player",
    label: { zh: "音乐播放器", en: "Music player" },
    description: { zh: "播放管理员配置的音频链接。", en: "Plays an admin-configured audio URL." },
    defaultWidth: "half",
    icon: Music2,
  },
  {
    type: "callout_banner",
    label: { zh: "行动横幅", en: "Callout banner" },
    description: { zh: "突出展示一条引导和按钮。", en: "Highlights a message with a button." },
    defaultWidth: "full",
    icon: MousePointerClick,
  },
  {
    type: "metric_tile",
    label: { zh: "指标卡片", en: "Metric tile" },
    description: { zh: "展示一个自定义数字或关键指标。", en: "Shows a custom number or key metric." },
    defaultWidth: "third",
    icon: Sparkles,
  },
]

export function PageComponent({ config, item, type }: { config?: PageComponentConfig; item?: PageComponentItem; type?: string }) {
  const componentType = item?.type || type || ""
  const componentConfig = item?.config || config || {}
  switch (componentType) {
    case "dashboard_stats":
      return <DashboardStatsWidget />
    case "announcements":
      return <AnnouncementsWidget />
    case "node_status":
      return <NodeStatusWidget />
    case "account_summary":
      return <AccountSummaryWidget />
    case "quick_links":
      return <QuickLinksWidget />
    case "custom_html":
      return <CustomHTMLWidget config={componentConfig} />
    case "iframe":
      return <IframeWidget config={componentConfig} />
    case "title_bar":
      return <TitleBarWidget config={componentConfig} />
    case "image_box":
      return <ImageBoxWidget config={componentConfig} />
    case "image_marquee":
      return <ImageMarqueeWidget config={componentConfig} />
    case "text_box":
      return <TextBoxWidget config={componentConfig} />
    case "clock":
      return <ClockWidget config={componentConfig} />
    case "music_player":
      return <MusicPlayerWidget config={componentConfig} />
    case "callout_banner":
      return <CalloutBannerWidget config={componentConfig} />
    case "metric_tile":
      return <MetricTileWidget config={componentConfig} />
    default:
      return null
  }
}

export function pageComponentLabel(type: string, language: string) {
  const preset = pageComponentPresets.find((item) => item.type === type)
  if (!preset) {
    return type
  }
  return language === "zh" ? preset.label.zh : preset.label.en
}

export function pageComponentDescription(type: string, language: string) {
  const preset = pageComponentPresets.find((item) => item.type === type)
  if (!preset) {
    return ""
  }
  return language === "zh" ? preset.description.zh : preset.description.en
}

export function defaultWidthForPageComponent(type: string): PageComponentWidth {
  return pageComponentPresets.find((item) => item.type === type)?.defaultWidth || "half"
}

export function defaultConfigForPageComponent(type: string): PageComponentConfig {
  if (type === "custom_html") {
    return {
      title: "HTML widget",
      html: "<div style=\"font-family: system-ui; padding: 16px;\"><strong>Custom HTML</strong><p>Edit this widget in visual editing mode.</p></div>",
      height: "240",
    }
  }
  if (type === "iframe") {
    return {
      title: "Iframe widget",
      iframe_url: "",
      iframe_height: "360",
    }
  }
  if (type === "title_bar") {
    return {
      eyebrow: "Featured",
      title: "Title bar",
      subtitle: "Add a short description for this page section.",
      align: "left",
      tone: "neutral",
    }
  }
  if (type === "image_box") {
    return {
      title: "Image box",
      image_url: "",
      caption: "Add an image URL and caption.",
      link_url: "",
      image_height: "260",
      object_fit: "cover",
    }
  }
  if (type === "image_marquee") {
    return {
      title: "Image marquee",
      image_urls: "",
      caption: "Add one image URL per line.",
      marquee_height: "180",
      marquee_speed: "28",
    }
  }
  if (type === "text_box") {
    return {
      title: "Text box",
      body: "Write custom text here.",
      tone: "neutral",
    }
  }
  if (type === "clock") {
    return {
      title: "Clock",
      timezone: "",
      timezone_label: "Local time",
      show_date: "true",
    }
  }
  if (type === "music_player") {
    return {
      title: "Music player",
      artist: "Artist",
      audio_url: "",
      cover_url: "",
    }
  }
  if (type === "callout_banner") {
    return {
      title: "Callout banner",
      body: "Highlight an action, update, or important link.",
      button_label: "Open",
      button_url: "",
      tone: "accent",
    }
  }
  if (type === "metric_tile") {
    return {
      title: "Custom metric",
      value: "128",
      helper: "Add context for this number.",
      tone: "accent",
    }
  }
  return {}
}

function CustomHTMLWidget({ config }: { config: PageComponentConfig }) {
  const { language } = useI18n()
  const title = stringConfig(config, "title")
  const html = stringConfig(config, "html")
  const height = sizeConfig(config, "height", 240)
  const emptyText = language === "zh" ? "HTML 内容为空" : "No HTML content"

  return (
    <Card className="h-full overflow-hidden">
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? undefined : "pt-6"}>
        {html ? (
          <iframe
            title={title || "HTML widget"}
            srcDoc={html}
            sandbox="allow-forms allow-popups allow-scripts"
            className="w-full rounded-md border bg-background"
            style={{ height }}
          />
        ) : (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{emptyText}</div>
        )}
      </CardContent>
    </Card>
  )
}

function IframeWidget({ config }: { config: PageComponentConfig }) {
  const { language } = useI18n()
  const title = stringConfig(config, "title")
  const url = stringConfig(config, "iframe_url")
  const height = sizeConfig(config, "iframe_height", 360)
  const emptyText = language === "zh" ? "iframe 地址为空" : "No iframe URL"

  return (
    <Card className="h-full overflow-hidden">
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? undefined : "pt-6"}>
        {url ? (
          <iframe
            title={title || "Iframe widget"}
            src={url}
            sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
            referrerPolicy="no-referrer"
            className="w-full rounded-md border bg-background"
            style={{ height }}
          />
        ) : (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{emptyText}</div>
        )}
      </CardContent>
    </Card>
  )
}

function TitleBarWidget({ config }: { config: PageComponentConfig }) {
  const eyebrow = stringConfig(config, "eyebrow")
  const title = stringConfig(config, "title") || "Title"
  const subtitle = stringConfig(config, "subtitle")
  const align = optionConfig(config, "align", ["left", "center"], "left")
  const tone = optionConfig(config, "tone", toneOptions, "neutral")

  return (
    <section className={cn("rounded-md border px-5 py-4", toneSurfaceClass(tone), align === "center" && "text-center")}>
      {eyebrow && <div className={cn("mb-1 text-xs font-semibold uppercase tracking-normal", toneTextClass(tone))}>{eyebrow}</div>}
      <h2 className="text-xl font-semibold leading-tight">{title}</h2>
      {subtitle && <p className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>}
    </section>
  )
}

function ImageBoxWidget({ config }: { config: PageComponentConfig }) {
  const { language } = useI18n()
  const title = stringConfig(config, "title")
  const imageUrl = stringConfig(config, "image_url")
  const caption = stringConfig(config, "caption")
  const linkUrl = stringConfig(config, "link_url")
  const height = sizeConfig(config, "image_height", 260)
  const fit = optionConfig(config, "object_fit", ["cover", "contain"], "cover") as "cover" | "contain"
  const emptyText = language === "zh" ? "图片地址为空" : "No image URL"
  const content = imageUrl ? (
    <img src={imageUrl} alt={title || caption || "Image box"} className="w-full rounded-md border bg-muted" style={{ height, objectFit: fit }} />
  ) : (
    <div className="flex items-center justify-center rounded-md border border-dashed bg-muted/40 text-sm text-muted-foreground" style={{ height }}>
      {emptyText}
    </div>
  )

  return (
    <Card className="h-full overflow-hidden">
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? "space-y-3" : "space-y-3 pt-6"}>
        {linkUrl ? (
          <a href={linkUrl} target="_blank" rel="noreferrer" className="block rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {content}
          </a>
        ) : (
          content
        )}
        {caption && <div className="text-sm leading-6 text-muted-foreground">{caption}</div>}
      </CardContent>
    </Card>
  )
}

function ImageMarqueeWidget({ config }: { config: PageComponentConfig }) {
  const { language } = useI18n()
  const title = stringConfig(config, "title")
  const caption = stringConfig(config, "caption")
  const images = parseLines(stringConfig(config, "image_urls"))
  const height = sizeConfig(config, "marquee_height", 180)
  const speed = numberConfig(config, "marquee_speed", 28, 8, 120)
  const emptyText = language === "zh" ? "请每行填写一个图片地址" : "Add one image URL per line"
  const loopImages = images.length > 0 ? [...images, ...images] : []

  return (
    <Card className="h-full overflow-hidden">
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? "space-y-3" : "space-y-3 pt-6"}>
        {images.length === 0 ? (
          <div className="flex items-center justify-center rounded-md border border-dashed bg-muted/40 text-sm text-muted-foreground" style={{ height }}>
            {emptyText}
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border bg-muted/40" style={{ height }}>
            <style>{`@keyframes flai-image-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
            <div className="flex h-full w-max gap-3 p-3" style={{ animation: `flai-image-marquee ${speed}s linear infinite` }}>
              {loopImages.map((url, index) => (
                <img key={`${url}-${index}`} src={url} alt="" className="h-full w-64 shrink-0 rounded-md border bg-background object-cover" />
              ))}
            </div>
          </div>
        )}
        {caption && <div className="text-sm leading-6 text-muted-foreground">{caption}</div>}
      </CardContent>
    </Card>
  )
}

function TextBoxWidget({ config }: { config: PageComponentConfig }) {
  const title = stringConfig(config, "title")
  const body = stringConfig(config, "body")
  const tone = optionConfig(config, "tone", toneOptions, "neutral")

  return (
    <Card className={cn("h-full", tone === "neutral" ? undefined : toneBorderClass(tone))}>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? undefined : "pt-6"}>
        <div className={cn("whitespace-pre-wrap rounded-md px-4 py-3 text-sm leading-6", toneSurfaceClass(tone))}>{body}</div>
      </CardContent>
    </Card>
  )
}

function ClockWidget({ config }: { config: PageComponentConfig }) {
  const { language } = useI18n()
  const [now, setNow] = useState(() => new Date())
  const locale = language === "zh" ? "zh-CN" : "en-US"
  const title = stringConfig(config, "title") || (language === "zh" ? "时钟" : "Clock")
  const timeZone = stringConfig(config, "timezone").trim()
  const timeZoneLabel = stringConfig(config, "timezone_label") || (timeZone || (language === "zh" ? "本地时间" : "Local time"))
  const showDate = booleanConfig(config, "show_date", true)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const timeText = useMemo(
    () =>
      formatDatePart(now, locale, timeZone, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    [locale, now, timeZone]
  )
  const dateText = useMemo(
    () =>
      formatDatePart(now, locale, timeZone, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        weekday: "short",
      }),
    [locale, now, timeZone]
  )

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="rounded-md border bg-muted/30 p-4">
          <div className="text-xs font-medium text-muted-foreground">{timeZoneLabel}</div>
          <div className="mt-2 font-mono text-3xl font-semibold leading-none">{timeText}</div>
          {showDate && <div className="mt-3 text-sm text-muted-foreground">{dateText}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

function MusicPlayerWidget({ config }: { config: PageComponentConfig }) {
  const { language } = useI18n()
  const title = stringConfig(config, "title") || (language === "zh" ? "音乐播放器" : "Music player")
  const artist = stringConfig(config, "artist")
  const audioUrl = stringConfig(config, "audio_url")
  const coverUrl = stringConfig(config, "cover_url")
  const emptyText = language === "zh" ? "音频地址为空" : "No audio URL"

  return (
    <Card className="h-full overflow-hidden">
      <CardContent className="flex h-full flex-col gap-4 pt-6">
        <div className="flex items-center gap-4">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-16 w-16 shrink-0 rounded-md border object-cover" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border bg-muted/50">
              <Music2 className="h-7 w-7 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{title}</div>
            {artist && <div className="mt-1 truncate text-sm text-muted-foreground">{artist}</div>}
          </div>
        </div>
        {audioUrl ? (
          <audio controls className="w-full" src={audioUrl}>
            {title}
          </audio>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{emptyText}</div>
        )}
      </CardContent>
    </Card>
  )
}

function CalloutBannerWidget({ config }: { config: PageComponentConfig }) {
  const title = stringConfig(config, "title")
  const body = stringConfig(config, "body")
  const buttonLabel = stringConfig(config, "button_label")
  const buttonUrl = stringConfig(config, "button_url")
  const tone = optionConfig(config, "tone", toneOptions, "accent")

  return (
    <section className={cn("flex flex-col gap-4 rounded-md border px-5 py-4 sm:flex-row sm:items-center sm:justify-between", toneSurfaceClass(tone), toneBorderClass(tone))}>
      <div className="min-w-0">
        {title && <h2 className="text-lg font-semibold leading-tight">{title}</h2>}
        {body && <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>}
      </div>
      {buttonLabel && buttonUrl && (
        <Button asChild className="shrink-0 gap-2">
          <a href={buttonUrl} target="_blank" rel="noreferrer">
            {buttonLabel}
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      )}
    </section>
  )
}

function MetricTileWidget({ config }: { config: PageComponentConfig }) {
  const title = stringConfig(config, "title")
  const value = stringConfig(config, "value")
  const helper = stringConfig(config, "helper")
  const tone = optionConfig(config, "tone", toneOptions, "accent")

  return (
    <Card className={cn("h-full", toneBorderClass(tone))}>
      <CardContent className="pt-6">
        <div className={cn("inline-flex rounded-md p-2", toneSurfaceClass(tone))}>
          <Sparkles className={cn("h-5 w-5", toneTextClass(tone))} />
        </div>
        {title && <div className="mt-4 text-sm font-medium text-muted-foreground">{title}</div>}
        <div className="mt-2 break-words text-3xl font-semibold leading-tight">{value}</div>
        {helper && <div className="mt-2 text-sm leading-6 text-muted-foreground">{helper}</div>}
      </CardContent>
    </Card>
  )
}

function stringConfig(config: PageComponentConfig, key: string) {
  const value = config[key]
  return typeof value === "string" ? value : ""
}

function sizeConfig(config: PageComponentConfig, key: string, fallback: number) {
  const value = Number(config[key])
  if (!Number.isFinite(value) || value < 80) {
    return fallback
  }
  return Math.min(1200, value)
}

function numberConfig(config: PageComponentConfig, key: string, fallback: number, min: number, max: number) {
  const value = Number(config[key])
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.min(max, Math.max(min, value))
}

function booleanConfig(config: PageComponentConfig, key: string, fallback: boolean) {
  const value = config[key]
  if (typeof value === "boolean") {
    return value
  }
  if (typeof value === "string") {
    return value === "true"
  }
  return fallback
}

function optionConfig(config: PageComponentConfig, key: string, options: readonly string[], fallback: string) {
  const value = stringConfig(config, key)
  return options.includes(value) ? value : fallback
}

function parseLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

const toneOptions = ["neutral", "accent", "success", "warning", "danger"] as const

function toneSurfaceClass(tone: string) {
  switch (tone) {
    case "accent":
      return "bg-blue-50 dark:bg-blue-500/10"
    case "success":
      return "bg-emerald-50 dark:bg-emerald-500/10"
    case "warning":
      return "bg-amber-50 dark:bg-amber-500/10"
    case "danger":
      return "bg-red-50 dark:bg-red-500/10"
    default:
      return "bg-card"
  }
}

function toneBorderClass(tone: string) {
  switch (tone) {
    case "accent":
      return "border-blue-200 dark:border-blue-500/30"
    case "success":
      return "border-emerald-200 dark:border-emerald-500/30"
    case "warning":
      return "border-amber-200 dark:border-amber-500/30"
    case "danger":
      return "border-red-200 dark:border-red-500/30"
    default:
      return ""
  }
}

function toneTextClass(tone: string) {
  switch (tone) {
    case "accent":
      return "text-blue-700 dark:text-blue-300"
    case "success":
      return "text-emerald-700 dark:text-emerald-300"
    case "warning":
      return "text-amber-700 dark:text-amber-300"
    case "danger":
      return "text-red-700 dark:text-red-300"
    default:
      return "text-muted-foreground"
  }
}

function formatDatePart(date: Date, locale: string, timeZone: string, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(locale, timeZone ? { ...options, timeZone } : options).format(date)
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(date)
  }
}

function DashboardStatsWidget() {
  const { t } = useI18n()
  const { data: user, isLoading: isUserLoading } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await api.get("/user/me")
      return res.data
    },
  })
  const { data: userStats } = useQuery<UserStats>({
    queryKey: ["stats", "user"],
    queryFn: async () => {
      const res = await api.get("/user/stats")
      return res.data
    },
  })
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })

  const currencyDisplayName = withPublicSettingsDefaults(settings).payment_currency_display_name
  const cards = isUserLoading ? userCards(t, currencyDisplayName) : userCards(t, currencyDisplayName, userStats, user)

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className={cn("h-4 w-4", card.color)} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function AnnouncementsWidget() {
  const { t } = useI18n()
  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["public-announcements"],
    queryFn: async () => {
      const res = await api.get("/public/announcements")
      return Array.isArray(res.data) ? res.data : []
    },
  })

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("dashboard.announcements")}</CardTitle>
        <Megaphone className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : announcements.length === 0 ? (
          <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">{t("dashboard.noAnnouncements")}</div>
        ) : (
          <div className="space-y-3">
            {announcements.map((announcement) => (
              <article key={announcement.id} className="rounded-md border p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <h2 className="text-base font-semibold">{announcement.title}</h2>
                  <div className="shrink-0 text-xs text-muted-foreground">{formatDateTime(announcement.created_at)}</div>
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{announcement.content}</div>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function NodeStatusWidget() {
  const { t } = useI18n()
  const { data: publicStatus, isLoading, isError } = useQuery<PublicStatusResponse>({
    queryKey: ["public-status"],
    queryFn: async () => {
      const res = await api.get("/public/status")
      return res.data
    },
    retry: false,
    refetchInterval: 30000,
  })
  const monitors = publicStatus?.monitors || []

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("dashboard.nodeStatus")}</CardTitle>
        <Server className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : isError ? (
          <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">{t("dashboard.statusUnavailable")}</div>
        ) : monitors.length === 0 ? (
          <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">{t("dashboard.noNodeStatus")}</div>
        ) : (
          <div className="grid gap-3">
            {monitors.map((monitor) => (
              <div key={monitor.id} className="rounded-md border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{monitor.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t("dashboard.lastCheck")}: {formatDateTime(monitor.last_checked_at)}
                    </div>
                  </div>
                  <div className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium", statusBadgeClass(monitor.status))}>
                    <StatusIcon status={monitor.status} />
                    {statusLabel(monitor.status, t)}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md bg-muted/50 p-2">
                    <div className="text-xs text-muted-foreground">{t("dashboard.latency")}</div>
                    <div className="mt-1 font-medium">{formatLatency(monitor.latency_ms)}</div>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <div className="text-xs text-muted-foreground">{t("dashboard.uptime")}</div>
                    <div className="mt-1 font-medium">{formatPercent(monitor.uptime)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AccountSummaryWidget() {
  const { language, t } = useI18n()
  const { data: user } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await api.get("/user/me")
      return res.data
    },
  })
  const { data: userStats } = useQuery<UserStats>({
    queryKey: ["stats", "user"],
    queryFn: async () => {
      const res = await api.get("/user/stats")
      return res.data
    },
  })
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const currencyDisplayName = withPublicSettingsDefaults(settings).payment_currency_display_name
  const title = language === "zh" ? "账户概览" : "Account summary"

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <UserCircle className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="truncate text-base font-semibold">{user?.username || user?.email || t("common.user")}</div>
          {user?.email && <div className="mt-1 truncate text-sm text-muted-foreground">{user.email}</div>}
        </div>
        <div className="grid gap-3 text-sm">
          <SummaryRow label={t("common.balance")} value={`${currencyDisplayName}${formatMoney(userStats?.balance ?? user?.balance ?? 0)}`} />
          <SummaryRow label={t("dashboard.todayRequests")} value={userStats?.today_requests || 0} />
          <SummaryRow label={t("dashboard.totalRequests")} value={userStats?.total_requests || 0} />
        </div>
      </CardContent>
    </Card>
  )
}

function QuickLinksWidget() {
  const { language, t } = useI18n()
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const title = language === "zh" ? "快捷入口" : "Quick links"
  void settings
  const actions = [
    { label: t("settings.apiKeys"), href: "/dashboard/api-keys", icon: KeyRound },
    { label: t("nav.wallet"), href: "/dashboard/wallet", icon: WalletCards },
    { label: t("nav.details"), href: "/dashboard/logs", icon: Database },
  ]

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <ArrowRight className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent className="grid gap-2">
        {actions.map((action) => (
          <Button key={action.href} variant="outline" className="justify-between" asChild>
            <Link to={action.href}>
              <span className="inline-flex min-w-0 items-center gap-2">
                <action.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{action.label}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 font-medium">{value}</span>
    </div>
  )
}

function userCards(t: ReturnType<typeof useI18n>["t"], currencyDisplayName: string, stats?: UserStats, user?: CurrentUser): StatCard[] {
  return [
    { title: t("common.balance"), value: `${currencyDisplayName}${formatMoney(stats?.balance ?? user?.balance ?? 0)}`, icon: CreditCard, color: "text-blue-500" },
    { title: t("dashboard.todayRequests"), value: stats?.today_requests || 0, icon: Activity, color: "text-green-500" },
    { title: t("dashboard.totalRequests"), value: stats?.total_requests || 0, icon: Database, color: "text-purple-500" },
    { title: t("dashboard.rpm"), value: stats?.rpm || 0, icon: BarChart3, color: "text-cyan-500" },
    { title: t("dashboard.tpm"), value: stats?.tpm || 0, icon: LineChart, color: "text-pink-500" },
    { title: t("dashboard.totalCost"), value: `${currencyDisplayName}${formatMoney(stats?.total_cost || 0)}`, icon: DollarSign, color: "text-yellow-500" },
  ]
}

function formatMoney(value: string | number) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) {
    return "0.00"
  }
  return amount.toFixed(2)
}

function StatusIcon({ status }: { status: string }) {
  switch ((status || "").toLowerCase()) {
    case "up":
      return <CheckCircle2 size={14} />
    case "down":
      return <AlertTriangle size={14} />
    default:
      return <Clock size={14} />
  }
}

function statusBadgeClass(status: string) {
  switch ((status || "").toLowerCase()) {
    case "up":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
    case "down":
      return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
    default:
      return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
  }
}

function statusLabel(status: string, t: ReturnType<typeof useI18n>["t"]) {
  switch ((status || "").toLowerCase()) {
    case "up":
      return t("dashboard.statusUp")
    case "down":
      return t("dashboard.statusDown")
    default:
      return t("dashboard.statusPending")
  }
}

function formatLatency(value: number) {
  if (!value || value <= 0) {
    return "-"
  }
  return `${value}ms`
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "-"
  }
  return `${value.toFixed(2)}%`
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}
