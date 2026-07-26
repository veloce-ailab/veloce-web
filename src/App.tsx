import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Layout } from "./components/layout/Layout"
import { PageTransition } from "./components/layout/PageTransition"
import Dashboard from "./pages/Dashboard"
import DataBoard from "./pages/DataBoard"
import Channels from "./pages/Channels"
import Models from "./pages/Models"
import Users from "./pages/Users"
import Logs from "./pages/Logs"
import Login from "./pages/Login"
import DesktopAuthorize from "./pages/DesktopAuthorize"
import Setup from "./pages/Setup"
import Home from "./pages/Home"
import ModelCatalog from "./pages/ModelCatalog"
import SettingsWorkspace from "./pages/SettingsWorkspace"
import Wallet from "./pages/Wallet"
import APIKeys from "./pages/APIKeys"
import Plugins from "./pages/Plugins"
import PluginSettingsPage from "./pages/PluginSettingsPage"
import PluginRoute from "./pages/PluginRoute"
import AdvancedChat from "./pages/AdvancedChat"
import SystemManagement from "./pages/SystemManagement"
import AdminOverview from "./pages/AdminOverview"
import AdminAuditLogs from "./pages/AdminAuditLogs"
import PublicContent from "./pages/PublicContent"
import EnterpriseTasks from "./pages/EnterpriseTasks"
import EnterpriseTaskDetail from "./pages/EnterpriseTaskDetail"
import EnterpriseManagement from "./pages/EnterpriseManagement"
import Tickets from "./pages/Tickets"
import AdminTickets from "./pages/AdminTickets"
import { CloudSandboxHostsPanel } from "./pages/CloudSandboxes"
import StatusPage from "./pages/StatusPage"
import api from "./lib/api"
import { I18nProvider, useI18n } from "./lib/i18n"
import { ToastProvider } from "./components/ui/toast"
import { ThemeProvider } from "./lib/theme"
import type { TranslationKey } from "./lib/i18n"
import type { PublicSettings } from "./lib/public-settings"
import { withPublicSettingsDefaults } from "./lib/public-settings"
import { desktopAuthorizePath, readDesktopAuthorizeStash } from "./lib/desktop-authorize"

const queryClient = new QueryClient()

type Language = "zh" | "en" | "ja"

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string

interface CurrentUser {
  is_admin: boolean
}

interface SetupStatus {
  required: boolean
}

const getTokenFromURL = () => {
  const hash = window.location.hash
  if (hash.startsWith("#token=")) {
    return hash.substring("#token=".length)
  }

  const hashQueryIndex = hash.indexOf("?")
  if (hashQueryIndex >= 0) {
    const token = new URLSearchParams(hash.substring(hashQueryIndex + 1)).get("token")
    if (token) {
      return token
    }
  }

  return new URLSearchParams(window.location.search).get("token")
}

const ProtectedRoute = ({
  children,
  isAuthenticated,
}: {
  children: React.ReactNode
  isAuthenticated: boolean
}) => {
  const location = useLocation()
  if (!isAuthenticated && location.pathname !== "/login") {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { t } = useI18n()
  const { data: user, isLoading } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await api.get("/user/me")
      return res.data
    },
  })

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
  }
  if (!user?.is_admin) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

const EnterpriseRoute = ({ children }: { children: React.ReactNode }) => {
  const { data: settings, isLoading } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => (await api.get("/public/settings")).data,
  })
  if (isLoading) {
    return <div className="text-sm text-muted-foreground">加载中...</div>
  }
  if (String(withPublicSettingsDefaults(settings).system_mode).toLowerCase() !== "enterprise") {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

const SetupGate = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation()
  const { t } = useI18n()
  const { data, isLoading } = useQuery<SetupStatus>({
    queryKey: ["setup-status"],
    queryFn: async () => {
      const res = await api.get("/setup/status")
      return res.data
    },
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    )
  }

  if (data?.required && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />
  }

  if (!data?.required && location.pathname === "/setup") {
    return <Navigate to={localStorage.getItem("token") ? "/dashboard" : "/login"} replace />
  }

  return <>{children}</>
}

const DocumentTitle = () => {
  const location = useLocation()
  const { language, t } = useI18n()
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const publicSettings = withPublicSettingsDefaults(settings)

  useEffect(() => {
    const siteName = publicSettings.site_name.trim() || "flai"
    const pageTitle = pageTitleForPath(location.pathname, language, t)
    document.title = pageTitle && pageTitle !== siteName ? `${pageTitle} - ${siteName}` : siteName
  }, [language, location.pathname, publicSettings.site_name, t])

  return null
}

function pageTitleForPath(pathname: string, language: Language, t: Translate) {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/"
  const publicTitles = language === "zh"
    ? {
        "/": "首页",
        "/setup": "初始化站点",
        "/login": "登录",
        "/models": "模型列表",
        "/status": "状态监测",
        "/about": "关于",
        "/privacy": "隐私政策",
        "/terms": "用户协议",
      }
    : language === "ja"
      ? {
          "/": "ホーム",
          "/setup": "初期設定",
          "/login": "サインイン",
          "/models": "モデル",
          "/status": "ステータス",
          "/about": "概要",
          "/privacy": "プライバシーポリシー",
          "/terms": "利用規約",
        }
      : {
          "/": "Home",
          "/setup": "Initial Setup",
          "/login": "Sign in",
          "/models": "Models",
          "/status": "Status",
          "/about": "About",
          "/privacy": "Privacy",
          "/terms": "Terms",
        }

  if (normalizedPathname in publicTitles) {
    return publicTitles[normalizedPathname as keyof typeof publicTitles]
  }

  if (normalizedPathname === "/dashboard") {
    return t("dashboard.title")
  }
  if (normalizedPathname === "/dashboard/admin-overview") {
    return t("nav.adminOverview")
  }
  if (normalizedPathname === "/dashboard/admin-logs" || normalizedPathname === "/dashboard/admin-overview/logs") {
    return language === "zh" ? "日志查看" : "Audit Logs"
  }
  if (normalizedPathname === "/dashboard/advanced-chat") {
    return t("nav.advancedChat")
  }
  if (normalizedPathname === "/dashboard/admin/advanced-chat") {
    return t("nav.advancedChat")
  }
  if (normalizedPathname === "/dashboard/data-board") {
    return t("dataBoard.title")
  }
  if (normalizedPathname.startsWith("/dashboard/admin/")) {
    return t("system.title")
  }
  if (normalizedPathname === "/dashboard/channels") {
    return t("channels.title")
  }
  if (normalizedPathname === "/dashboard/users") {
    return t("users.title")
  }
  if (normalizedPathname === "/dashboard/models") {
    return t("models.title")
  }
  if (normalizedPathname === "/dashboard/logs") {
    return language === "zh" ? "明细" : language === "ja" ? "明細" : "Details"
  }
  if (normalizedPathname === "/dashboard/tasks") {
    return language === "zh" ? "我的任务" : "My Tasks"
  }
  if (normalizedPathname === "/dashboard/tickets") {
    return language === "zh" ? "工单" : "Support Tickets"
  }
  if (normalizedPathname === "/dashboard/admin/tickets") {
    return language === "zh" ? "工单管理" : "Ticket Management"
  }
  if (normalizedPathname === "/dashboard/enterprise") {
    return language === "zh" ? "企业管理" : "Enterprise Management"
  }
  if (normalizedPathname === "/dashboard/wallet") {
    return language === "zh" ? "钱包" : language === "ja" ? "ウォレット" : "Wallet"
  }
  if (normalizedPathname === "/dashboard/api-keys") {
    return t("settings.apiKeys")
  }
  if (normalizedPathname === "/dashboard/plugins" || normalizedPathname.startsWith("/dashboard/plugins/")) {
    return t("nav.plugins")
  }
  if (normalizedPathname === "/chat") {
    return t("nav.chat")
  }
  if (normalizedPathname === "/chat/images") {
    return language === "zh" ? "AI 绘画" : language === "ja" ? "AI画像" : "AI Images"
  }
  if (normalizedPathname === "/chat/videos") {
    return language === "zh" ? "AI 视频" : language === "ja" ? "AI Videos" : "AI Videos"
  }
  if (normalizedPathname === "/chat/files") {
    return language === "zh" ? "文件库" : "Files"
  }
  if (normalizedPathname === "/chat/knowledge") {
    return t("nav.knowledgeBases")
  }
  if (normalizedPathname === "/chat/memories") {
    return language === "zh" ? "记忆" : "Memory"
  }
  if (normalizedPathname === "/chat/agents" || normalizedPathname.startsWith("/chat/agents/")) {
    return t("nav.agents")
  }
  if (normalizedPathname === "/chat/devices") {
    return t("nav.devices")
  }
  if (normalizedPathname === "/chat/mcp") {
    return "MCP"
  }
  if (normalizedPathname === "/dashboard/chat") {
    return t("nav.chat")
  }
  if (normalizedPathname === "/dashboard/images") {
    return language === "zh" ? "AI 绘画" : language === "ja" ? "AI画像" : "AI Images"
  }
  if (normalizedPathname === "/dashboard/videos") {
    return language === "zh" ? "AI 视频" : language === "ja" ? "AI Videos" : "AI Videos"
  }
  if (normalizedPathname === "/settings" || normalizedPathname.startsWith("/settings/")) {
    return t("settings.title")
  }

  return ""
}

function App() {
  const [isAuthenticated] = useState(() => {
    const token = getTokenFromURL()
    if (token) {
      localStorage.setItem("token", token)
      localStorage.removeItem("referral_code")
      return true
    }
    return Boolean(localStorage.getItem("token"))
  })

  useEffect(() => {
    const token = getTokenFromURL()
    if (token) {
      localStorage.setItem("token", token)
      localStorage.removeItem("referral_code")
      // A pending desktop authorization (e.g. the OIDC callback landed here)
      // takes priority over the dashboard.
      const desktopStash = readDesktopAuthorizeStash()
      if (desktopStash) {
        window.location.replace(desktopAuthorizePath(desktopStash))
        return
      }
      window.history.replaceState(null, "", "/dashboard")
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <ToastProvider>
            <BrowserRouter>
              <DocumentTitle />
              <SetupGate>
            <Routes>
              <Route path="/" element={<PageTransition><Home /></PageTransition>} />
              <Route path="/setup" element={<PageTransition><Setup /></PageTransition>} />
              <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
              <Route path="/desktop/authorize" element={<PageTransition><DesktopAuthorize /></PageTransition>} />
              <Route path="/models" element={<PageTransition><ModelCatalog /></PageTransition>} />
              <Route path="/status" element={<PageTransition><StatusPage /></PageTransition>} />
              <Route path="/about" element={<PageTransition><PublicContent kind="about" /></PageTransition>} />
              <Route path="/privacy" element={<PageTransition><PublicContent kind="privacy" /></PageTransition>} />
              <Route path="/terms" element={<PageTransition><PublicContent kind="terms" /></PageTransition>} />
              <Route
                path="/chat/*"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <AdvancedChat />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/*"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <SettingsWorkspace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="data-board" element={<DataBoard />} />
                <Route path="personal-company" element={<Navigate to="/chat/agent-groups" replace />} />
                <Route path="tickets" element={<Tickets />} />
                <Route path="admin/tickets" element={<AdminRoute><AdminTickets /></AdminRoute>} />
                <Route path="tasks" element={<EnterpriseRoute><EnterpriseTasks /></EnterpriseRoute>} />
				<Route path="tasks/:id" element={<EnterpriseRoute><EnterpriseTaskDetail /></EnterpriseRoute>} />
				<Route path="enterprise/tasks/:id" element={<EnterpriseRoute><AdminRoute><EnterpriseTaskDetail /></AdminRoute></EnterpriseRoute>} />
                <Route path="enterprise" element={<EnterpriseRoute><AdminRoute><EnterpriseManagement /></AdminRoute></EnterpriseRoute>} />
                <Route
                  path="admin-overview"
                  element={
                    <AdminRoute>
                      <AdminOverview />
                    </AdminRoute>
                  }
                />
                <Route
                  path="admin-logs"
                  element={
                    <AdminRoute>
                      <AdminAuditLogs />
                    </AdminRoute>
                  }
                />
                <Route path="admin-overview/logs" element={<Navigate to="/dashboard/admin-logs" replace />} />
                <Route
                  path="advanced-chat"
                  element={<Navigate to="/dashboard/admin/advanced-chat" replace />}
                />
                <Route path="admin" element={<Navigate to="/dashboard/admin/general" replace />} />
                <Route
                  path="admin/general"
                  element={
                    <AdminRoute>
                      <SystemManagement section="general" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="admin/theme"
                  element={
                    <AdminRoute>
                      <SystemManagement section="theme" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="admin/auth"
                  element={
                    <AdminRoute>
                      <SystemManagement section="auth" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="admin/content"
                  element={
                    <AdminRoute>
                      <SystemManagement section="content" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="admin/operations"
                  element={
                    <AdminRoute>
                      <SystemManagement section="operations" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="admin/advanced-chat"
                  element={
                    <AdminRoute>
                      <SystemManagement section="advancedChat" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="admin/sandboxes"
                  element={
                    <AdminRoute>
                      <CloudSandboxHostsPanel />
                    </AdminRoute>
                  }
                />
                <Route
                  path="admin/subscriptions"
                  element={
                    <AdminRoute>
                      <SystemManagement section="operations" initialTab="subscriptionPlans" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="admin/redeem-codes"
                  element={
                    <AdminRoute>
                      <SystemManagement section="operations" initialTab="redeemCodes" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="channels"
                  element={
                    <AdminRoute>
                      <Channels />
                    </AdminRoute>
                  }
                />
                <Route
                  path="users"
                  element={
                    <AdminRoute>
                      <Users />
                    </AdminRoute>
                  }
                />
                <Route
                  path="models"
                  element={
                    <AdminRoute>
                      <Models />
                    </AdminRoute>
                  }
                />
                <Route path="logs" element={<Logs />} />
                <Route path="wallet" element={<Wallet />} />
                <Route path="api-keys" element={<APIKeys />} />
                <Route
                  path="plugins"
                  element={
                    <AdminRoute>
                      <Plugins />
                    </AdminRoute>
                  }
                />
                <Route path="plugins/:pluginId/settings" element={<PluginSettingsPage />} />
                <Route path="plugins/:pluginId/*" element={<PluginRoute />} />
                <Route path="chat" element={<Navigate to="/chat" replace />} />
                <Route path="images" element={<Navigate to="/chat/images" replace />} />
                <Route path="videos" element={<Navigate to="/chat/videos" replace />} />
                <Route path="settings/*" element={<Navigate to="/settings/profile" replace />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
              </SetupGate>
            </BrowserRouter>
          </ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App
