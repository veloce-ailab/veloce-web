import { BarChart3, Boxes, ChevronDown, ChevronRight, Database, History, Home, KeyRound, LayoutDashboard, LifeBuoy, Puzzle, ScrollText, Shield, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link, useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { TranslationKey } from "@/lib/i18n"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"
import { cn } from "@/lib/utils"

interface CurrentUser {
  is_admin: boolean
}

interface MenuItem {
  icon: LucideIcon
  colorClass?: string
  labelKey?: TranslationKey
  label?: string
  path: string
  settingKey?: keyof PublicSettings
  personalOnly?: boolean
  children?: SystemSubItem[]
}

interface SystemSubItem {
  path: string
  labelKey?: TranslationKey
  label?: string
  colorClass: string
}

const systemSubItems: SystemSubItem[] = [
  { path: "/dashboard/admin/general", labelKey: "nav.systemGeneral", colorClass: "bg-blue-500" },
  { path: "/dashboard/admin/theme", labelKey: "nav.systemTheme", colorClass: "bg-fuchsia-500" },
  { path: "/dashboard/admin/auth", labelKey: "nav.systemAuth", colorClass: "bg-emerald-500" },
  { path: "/dashboard/admin/content", labelKey: "nav.systemContent", colorClass: "bg-cyan-500" },
  { path: "/dashboard/admin/operations", labelKey: "nav.systemOperations", colorClass: "bg-amber-500" },
  { path: "/dashboard/admin/ops", labelKey: "nav.systemOps", colorClass: "bg-orange-500" },
]

const desktopSystemSubItems: SystemSubItem[] = systemSubItems.map((item) => ({
  ...item,
  path: item.path === "/dashboard/admin/general" ? "/dashboard" : item.path.replace("/dashboard/admin/", "/dashboard/"),
}))

const desktopManagementItems: MenuItem[] = [
  { icon: Shield, colorClass: "bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300", labelKey: "nav.system", path: "/dashboard", children: desktopSystemSubItems },
  { icon: Database, colorClass: "bg-teal-500/15 text-teal-600 dark:bg-teal-400/15 dark:text-teal-300", labelKey: "nav.channels", path: "/dashboard/channels" },
  { icon: Boxes, colorClass: "bg-pink-500/15 text-pink-600 dark:bg-pink-400/15 dark:text-pink-300", labelKey: "nav.models", path: "/dashboard/models" },
]

const userMenuItems: MenuItem[] = [
  { icon: LayoutDashboard, colorClass: "bg-blue-500/15 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300", labelKey: "nav.dashboard", path: "/dashboard", settingKey: "sidebar_dashboard_enabled" },
  { icon: BarChart3, colorClass: "bg-violet-500/15 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300", labelKey: "nav.dataBoard", path: "/dashboard/data-board", settingKey: "sidebar_data_board_enabled" },
  { icon: History, colorClass: "bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300", labelKey: "nav.details", path: "/dashboard/logs", settingKey: "sidebar_usage_enabled" },
  { icon: KeyRound, colorClass: "bg-cyan-500/15 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-300", labelKey: "nav.apiKeys", path: "/dashboard/api-keys", settingKey: "sidebar_api_keys_enabled" },
  { icon: LifeBuoy, colorClass: "bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300", labelKey: "nav.tickets", path: "/dashboard/tickets" },
]

const adminMenuItems: MenuItem[] = [
  { icon: BarChart3, colorClass: "bg-fuchsia-500/15 text-fuchsia-600 dark:bg-fuchsia-400/15 dark:text-fuchsia-300", labelKey: "nav.adminOverview", path: "/dashboard/admin-overview", settingKey: "sidebar_admin_overview_enabled" },
  { icon: ScrollText, colorClass: "bg-slate-500/15 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300", labelKey: "nav.auditLogs", path: "/dashboard/admin-logs", settingKey: "sidebar_admin_overview_enabled" },
  { icon: Shield, colorClass: "bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300", labelKey: "nav.system", path: "/dashboard/admin/general", settingKey: "sidebar_system_enabled", children: systemSubItems },
  { icon: LifeBuoy, colorClass: "bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300", labelKey: "nav.adminTickets", path: "/dashboard/admin/tickets" },
  { icon: Database, colorClass: "bg-teal-500/15 text-teal-600 dark:bg-teal-400/15 dark:text-teal-300", labelKey: "nav.channels", path: "/dashboard/channels", settingKey: "sidebar_channels_enabled" },
  { icon: Boxes, colorClass: "bg-pink-500/15 text-pink-600 dark:bg-pink-400/15 dark:text-pink-300", labelKey: "nav.models", path: "/dashboard/models", settingKey: "sidebar_models_enabled" },
  { icon: Users, colorClass: "bg-lime-500/15 text-lime-700 dark:bg-lime-400/15 dark:text-lime-300", labelKey: "nav.users", path: "/dashboard/users", settingKey: "sidebar_users_enabled" },
  {
    icon: Puzzle,
    colorClass: "bg-purple-500/15 text-purple-600 dark:bg-purple-400/15 dark:text-purple-300",
    labelKey: "nav.plugins",
    path: "/dashboard/plugins",
    children: [
      { path: "/dashboard/plugins", labelKey: "nav.installedPlugins", colorClass: "bg-purple-500" },
      { path: "/dashboard/plugins/market", labelKey: "nav.pluginMarket", colorClass: "bg-emerald-500" },
    ],
  },
]

export function Sidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const location = useLocation()
  const { data: user } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await api.get("/user/me")
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
  const { data: pluginExtensions } = useQuery<unknown>({
    queryKey: ["plugins-frontend"],
    queryFn: async () => {
      const res = await api.get("/user/plugins/frontend")
      return res.data
    },
    enabled: Boolean(user),
  })
  const publicSettings = withPublicSettingsDefaults(settings)
	const personalMode = String(publicSettings.system_mode).toLowerCase() === "personal"
  const visibleUserItems = userMenuItems
		.filter((item) => (!item.settingKey || publicSettings[item.settingKey] !== false) && (!item.personalOnly || personalMode))
  const visibleAdminItems = adminMenuItems
		.filter((item) => (!item.settingKey || publicSettings[item.settingKey] !== false) && (!item.personalOnly || personalMode))
  const pluginItems = pluginSidebarItems(pluginExtensions)

  return (
    <div className={cn("flex h-full w-56 flex-col border-r bg-card", className)}>
      <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-1">
          {visibleUserItems.map((item) => (
            <SidebarLink key={item.path} item={item} active={location.pathname === item.path} onNavigate={onNavigate} />
          ))}
          {user?.is_admin && visibleAdminItems.length > 0 && (
            <>
              <div className="my-2 border-t" />
              {visibleAdminItems.map((item) => (
                <SidebarLink
                  key={item.path}
                  item={item}
                  active={isSidebarItemActive(location.pathname, item)}
                  currentPath={location.pathname}
                  onNavigate={onNavigate}
                />
              ))}
            </>
          )}
          {pluginItems.length > 0 && <div className="my-2 border-t" />}
          {pluginItems.map((item) => (
            <SidebarLink key={item.path} item={item} active={location.pathname === item.path || location.pathname.startsWith(item.path + "/")} onNavigate={onNavigate} />
          ))}
        </div>
      </nav>
    </div>
  )
}

function SidebarLink({
  item,
  active,
  currentPath = "",
  onNavigate,
}: {
  item: MenuItem
  active: boolean
  currentPath?: string
  onNavigate?: () => void
}) {
  const { t } = useI18n()
  const isExpanded = active && Boolean(item.children?.length)
  const label = item.label || (item.labelKey ? t(item.labelKey) : item.path)
  return (
    <div>
      <Link
        to={item.path}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-2xl px-3 py-2 transition-colors text-sm font-medium",
          active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted"
        )}
        >
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-xl transition-colors", active ? "bg-primary-foreground/15 text-primary-foreground" : item.colorClass || "bg-muted text-muted-foreground")}>
          <item.icon size={16} />
        </span>
        <span className="flex-1">{label}</span>
        {item.children && <ChevronDown size={14} className={cn("transition-transform", isExpanded && "rotate-180")} />}
      </Link>
      {isExpanded && item.children && (
        <div className="mt-1 flex flex-col items-center gap-1">
          {item.children.map((child) => {
            const childActive = currentPath === child.path
            return (
              <Link
                key={child.path}
                to={child.path}
                onClick={onNavigate}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-sm transition-colors",
                  childActive ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span className={cn("size-1.5 shrink-0 rounded-full", child.colorClass)} />
                {child.label || (child.labelKey ? t(child.labelKey) : child.path)}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function isSidebarItemActive(pathname: string, item: MenuItem) {
  if (item.children?.length) {
    if (pathname === item.path || item.children.some((child) => pathname === child.path || pathname.startsWith(child.path + "/"))) {
      return true
    }
    // 兜底：订阅、兑换码等未列入子菜单的 /dashboard/admin/* 页面仍归属系统管理，
    // 但要排除属于其它菜单项的路径（如工单管理 /dashboard/admin/tickets），
    // 否则两个菜单会同时高亮
    return item.path.startsWith("/dashboard/admin/") && pathname.startsWith("/dashboard/admin/") && !pathname.startsWith("/dashboard/admin/tickets")
  }
  return pathname === item.path
}

export function SystemManagementSidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const location = useLocation()
  const { t } = useI18n()

  return (
    <aside className={cn("flex h-full w-56 shrink-0 flex-col border-r bg-card", className)}>
      <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-3 flex items-center gap-1 border-b pb-3 text-sm">
          <Link
            to="/dashboard"
            onClick={onNavigate}
            className="flex h-8 w-8 items-center justify-center rounded-2xl hover:bg-muted"
            aria-label={t("nav.dashboard")}
            title={t("nav.dashboard")}
          >
            <Home size={16} />
          </Link>
          <ChevronRight size={14} className="text-muted-foreground" />
          <span className="min-w-0 truncate font-medium">{t("nav.system")}</span>
        </div>
        <div className="flex flex-col gap-1">
          {desktopManagementItems.map((item) => (
            <SidebarLink
              key={item.path}
              item={item}
              active={isSidebarItemActive(location.pathname, item)}
              currentPath={location.pathname}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>
    </aside>
  )
}

interface PluginFrontendItem {
  id: string
  name: string
  frontend?: unknown
}

function pluginSidebarItems(data: unknown): MenuItem[] {
  const plugins = normalizePluginFrontendItems(data)
  const items: MenuItem[] = []
  for (const plugin of plugins) {
    const frontend = isRecord(plugin.frontend) ? plugin.frontend : {}
    const sidebar = Array.isArray(frontend.sidebar) ? frontend.sidebar : []
    for (const raw of sidebar) {
      if (!isRecord(raw)) continue
      const label = stringValue(raw.label) || plugin.name || plugin.id
      const declaredPath = stringValue(raw.path)
      const path = normalizePluginSidebarPath(plugin.id, declaredPath)
      if (!path) continue
      items.push({ icon: Puzzle, colorClass: "bg-purple-500/15 text-purple-600 dark:bg-purple-400/15 dark:text-purple-300", label, path })
    }
  }
  return items
}

function normalizePluginFrontendItems(value: unknown): PluginFrontendItem[] {
  const source = Array.isArray(value) ? value : Array.isArray(recordValue(value, "plugins")) ? recordValue(value, "plugins") : []
  return Array.isArray(source) ? source.map(normalizePluginFrontendItem).filter((item): item is PluginFrontendItem => Boolean(item)) : []
}

function normalizePluginFrontendItem(value: unknown): PluginFrontendItem | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  if (!id) return null
  return {
    id,
    name: stringValue(value.name),
    frontend: value.frontend,
  }
}

function normalizePluginSidebarPath(pluginID: string, declaredPath: string) {
  if (!pluginID) return ""
  if (!declaredPath) return `/dashboard/plugins/${encodeURIComponent(pluginID)}`
  if (declaredPath.startsWith("/dashboard/plugins/")) return declaredPath
  if (declaredPath.startsWith("/plugins/")) return `/dashboard${declaredPath}`
  return `/dashboard/plugins/${encodeURIComponent(pluginID)}/${declaredPath.replace(/^\/+/, "")}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function recordValue(value: unknown, key: string) {
  return isRecord(value) ? value[key] : undefined
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return ""
}
