import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, ExternalLink, KeyRound, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { APIKeyCreateDialog } from "@/components/api-key-create-dialog"
import type { CreateAPIKeyResponse, UserChannelCatalog } from "@/components/api-key-create-dialog"
import api, { clearAuthToken, getAuthToken } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { PublicSettings } from "@/lib/public-settings"
import { isPersonalMode, withPublicSettingsDefaults } from "@/lib/public-settings"
import {
  describeTokenAuthorizeTarget,
  readTokenAuthorizeRequest,
  tokenAuthorizeErrorCallback,
  tokenAuthorizeReturnPath,
} from "@/lib/token-authorize"
import { useToast } from "@/components/ui/toast"

interface CurrentUser {
  username?: string
  email?: string
  avatar_url?: string
}

interface UserToken {
  id: number
  name: string
  key_prefix: string
  enabled: boolean
  expires_at?: string | null
  created_at?: string
}

const isUsableToken = (token: UserToken) => {
  if (!token.enabled) return false
  return !token.expires_at || new Date(token.expires_at).getTime() > Date.now()
}

// The create dialog expects already-normalized channel entries.
function normalizeCatalogItem(value: unknown): UserChannelCatalog {
  const item = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    description: typeof item.description === "string" ? item.description : "",
    multiplier: typeof item.multiplier === "string" || typeof item.multiplier === "number" ? item.multiplier : 1,
    models: Array.isArray(item.models) ? item.models.filter((model): model is string => typeof model === "string") : [],
  }
}

// Authorization page for third-party applications that want to use one of the
// user's API tokens. The application never registers a client id or secret: it
// supplies a state and a callback, and later redeems that state for the token.
export default function TokenAuthorize() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const { success } = useToast()
  const queryClient = useQueryClient()
  const search = window.location.search
  const { request, error: paramError } = useMemo(() => readTokenAuthorizeRequest(search), [search])
  const isAuthenticated = Boolean(getAuthToken())
  const [selectedTokenID, setSelectedTokenID] = useState<number | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const redirectedToLogin = useRef(false)

  const returnPath = useMemo(() => tokenAuthorizeReturnPath(search), [search])
  const loginPath = useMemo(() => `/login?${new URLSearchParams({ return_to: returnPath }).toString()}`, [returnPath])

  useEffect(() => {
    if (!request || redirectedToLogin.current) {
      return
    }
    if (!isAuthenticated) {
      redirectedToLogin.current = true
      window.location.replace(loginPath)
    }
  }, [request, isAuthenticated, loginPath])

  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => (await api.get("/public/settings")).data,
    enabled: Boolean(request),
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const personalMode = isPersonalMode(publicSettings)

  const { data: catalog = [] } = useQuery<UserChannelCatalog[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalogItem) : []
    },
    enabled: Boolean(request) && isAuthenticated,
  })

  const { data: user, isLoading: isUserLoading } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/user/me")).data,
    enabled: Boolean(request) && isAuthenticated,
    retry: false,
  })

  const { data: tokens = [], isLoading: isTokensLoading } = useQuery<UserToken[]>({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await api.get("/user/api-keys")
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: Boolean(request) && isAuthenticated,
  })

  const usableTokens = useMemo(() => tokens.filter(isUsableToken), [tokens])
  // Default to the first usable token without an effect: the selection is
  // derived, and an explicit click simply overrides it.
  const effectiveTokenID = selectedTokenID ?? usableTokens[0]?.id ?? null
  const selectedToken = useMemo(
    () => usableTokens.find((token) => token.id === effectiveTokenID) || null,
    [usableTokens, effectiveTokenID],
  )

  const approve = async () => {
    if (!request || !selectedToken) {
      return
    }
    setSubmitError("")
    setIsSubmitting(true)
    try {
      const response = await api.post("/user/oauth/authorize", {
        state: request.state,
        redirect_uri: request.redirectUri,
        api_key_id: selectedToken.id,
      })
      const redirectURL = typeof response.data?.redirect_url === "string" ? response.data.redirect_url : ""
      if (!redirectURL) {
        throw new Error(copy.authorizeFailed)
      }
      setIsRedirecting(true)
      window.location.replace(redirectURL)
    } catch (err) {
      const message =
        err && typeof err === "object" && "response" in err
          ? String((err as { response?: { data?: { error?: string } } }).response?.data?.error || copy.authorizeFailed)
          : copy.authorizeFailed
      setSubmitError(message)
      setIsSubmitting(false)
    }
  }

  const deny = () => {
    if (!request) {
      return
    }
    const target = tokenAuthorizeErrorCallback(request.redirectUri, {
      error: "access_denied",
      state: request.state,
    })
    setIsRedirecting(true)
    if (target) {
      window.location.replace(target)
    }
  }

  const switchAccount = () => {
    clearAuthToken()
    window.location.replace(loginPath)
  }

  const handleCreated = (result: CreateAPIKeyResponse) => {
    success(copy.createdAndSelected)
    if (result?.key?.id) {
      setSelectedTokenID(result.key.id)
    }
    void queryClient.invalidateQueries({ queryKey: ["api-keys"] })
  }

  if (!request) {
    return (
      <AuthFrame>
        <CardHeader className="text-center">
          <CardTitle>{copy.invalidTitle}</CardTitle>
          <CardDescription>
            {paramError === "redirect_uri" ? copy.invalidRedirect : copy.invalidState}
          </CardDescription>
        </CardHeader>
      </AuthFrame>
    )
  }

  if (!isAuthenticated) {
    return (
      <AuthFrame>
        <CardContent className="text-center text-sm text-muted-foreground">{copy.redirectingToLogin}</CardContent>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame>
      <CardHeader className="text-center">
        {publicSettings.icon_url && (
          <img src={publicSettings.icon_url} alt="" className="mx-auto h-12 w-12 rounded object-cover" />
        )}
        <CardTitle className="mt-2 text-2xl font-bold">{copy.title}</CardTitle>
        <CardDescription>
          {request.appName ? copy.descriptionWithApp.replace("{app}", request.appName) : copy.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          {isUserLoading ? (
            <span className="text-muted-foreground">{copy.loadingUser}</span>
          ) : (
            <div className="flex items-center gap-3">
              {user?.avatar_url && <img src={user.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />}
              <div className="min-w-0">
                <div className="truncate font-medium">{user?.username || copy.currentAccount}</div>
                {user?.email && <div className="truncate text-xs text-muted-foreground">{user.email}</div>}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <div className="font-medium">{copy.trustTitle}</div>
            <div className="text-muted-foreground">{copy.trustBody}</div>
            <div className="text-muted-foreground">
              {copy.redirectTarget}: <span className="font-mono">{describeTokenAuthorizeTarget(request.redirectUri)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">{copy.selectToken}</div>
          {isTokensLoading ? (
            <div className="text-sm text-muted-foreground">{copy.loadingTokens}</div>
          ) : usableTokens.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{copy.noTokens}</div>
          ) : (
            <div className="max-h-64 space-y-2 overflow-auto" role="radiogroup" aria-label={copy.selectToken}>
              {usableTokens.map((token) => {
                const active = token.id === effectiveTokenID
                return (
                  <button
                    key={token.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`flex w-full items-center gap-3 rounded-md border p-3 text-left text-sm transition-colors ${
                      active ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                    }`}
                    onClick={() => setSelectedTokenID(token.id)}
                  >
                    <KeyRound size={16} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{token.name || copy.unnamedToken}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">{token.key_prefix}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          <Button variant="outline" className="w-full gap-2" onClick={() => setIsCreateOpen(true)}>
            <Plus size={16} />
            {copy.createToken}
          </Button>
        </div>

        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>{copy.scopeToken}</li>
          <li>{copy.scopeRevoke}</li>
          <li>{copy.scopeDeny}</li>
        </ul>

        {submitError && <div className="text-center text-sm text-destructive">{submitError}</div>}

        <Button
          className="w-full"
          disabled={isSubmitting || isRedirecting || !selectedToken}
          onClick={() => void approve()}
        >
          {isRedirecting ? copy.redirecting : isSubmitting ? copy.authorizing : copy.approve}
        </Button>
        <Button variant="outline" className="w-full" disabled={isSubmitting || isRedirecting} onClick={switchAccount}>
          {copy.switchAccount}
        </Button>
        <Button variant="ghost" className="w-full" disabled={isSubmitting || isRedirecting} onClick={deny}>
          {copy.deny}
        </Button>
        <div className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
          <ExternalLink size={12} />
          <span>{copy.callbackHint}</span>
        </div>
      </CardContent>

      <APIKeyCreateDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        catalog={catalog}
        personalMode={personalMode}
        onCreated={handleCreated}
      />
    </AuthFrame>
  )
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-[480px]">{children}</Card>
    </div>
  )
}

const zhCopy = {
  title: "授权应用访问你的令牌",
  description: "有一个外部应用请求使用你的 Veloce 令牌",
  descriptionWithApp: "「{app}」请求使用你的 Veloce 令牌",
  invalidTitle: "授权请求无效",
  invalidState: "缺少或不合法的 state 参数，请回到应用重新发起授权。",
  invalidRedirect: "回调地址不合法。必须是 https 地址（本地开发允许 http://localhost）或应用自定义协议。",
  redirectingToLogin: "正在跳转到登录页……",
  loadingUser: "正在加载账号信息……",
  currentAccount: "当前账号",
  trustTitle: "请确认你信任这个应用",
  trustBody: "授权后，该应用会拿到你下面所选令牌的完整权限，可以代表你调用接口并消耗你的额度。",
  redirectTarget: "授权后返回",
  selectToken: "选择要交给该应用的令牌",
  loadingTokens: "正在加载令牌……",
  noTokens: "你还没有可用的令牌，请先创建一个。",
  unnamedToken: "未命名令牌",
  createToken: "创建新令牌",
  createdAndSelected: "已创建并选中新令牌",
  scopeToken: "该应用将获得所选令牌的全部权限，效果等同于把令牌直接交给它",
  scopeRevoke: "你可以随时在「令牌」页面停用或删除该令牌来撤销访问",
  scopeDeny: "如果你不认识这个应用，请选择取消，不要授权",
  approve: "授权并返回应用",
  authorizing: "授权中……",
  redirecting: "正在返回应用……",
  switchAccount: "使用其他账号",
  deny: "取消授权",
  callbackHint: "令牌不会出现在跳转链接里，应用会用 state 换取令牌",
  authorizeFailed: "授权失败，请重试",
}

const enCopy: typeof zhCopy = {
  title: "Authorize app access to your token",
  description: "An external application is requesting one of your Veloce tokens",
  descriptionWithApp: "“{app}” is requesting one of your Veloce tokens",
  invalidTitle: "Invalid authorization request",
  invalidState: "The state parameter is missing or malformed. Please start the authorization again from the app.",
  invalidRedirect: "The callback URL is not allowed. Use https (or http://localhost for local development) or an app custom scheme.",
  redirectingToLogin: "Redirecting to sign-in…",
  loadingUser: "Loading account…",
  currentAccount: "Current account",
  trustTitle: "Only continue if you trust this application",
  trustBody: "After authorizing, the app receives full access to the token you select and can call the API and spend your quota.",
  redirectTarget: "Returns to",
  selectToken: "Choose the token to hand to this app",
  loadingTokens: "Loading tokens…",
  noTokens: "You have no usable token yet — create one first.",
  unnamedToken: "Unnamed token",
  createToken: "Create new token",
  createdAndSelected: "New token created and selected",
  scopeToken: "The app gets the full permissions of the selected token — the same as handing it the token directly",
  scopeRevoke: "You can disable or delete the token on the Tokens page at any time to revoke access",
  scopeDeny: "If you do not recognise this app, cancel instead of authorizing",
  approve: "Authorize and return to app",
  authorizing: "Authorizing…",
  redirecting: "Returning to the app…",
  switchAccount: "Use another account",
  deny: "Cancel",
  callbackHint: "The token never appears in the redirect; the app redeems its state for it",
  authorizeFailed: "Authorization failed, please try again",
}
