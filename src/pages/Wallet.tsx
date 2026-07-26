import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarCheck, Copy, CreditCard, Gift, Package, WalletCards } from "lucide-react"
import { useEffect, useState } from "react"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import type { PublicSettings } from "@/lib/public-settings"
import { isPersonalMode, withPublicSettingsDefaults } from "@/lib/public-settings"

interface CurrentUser {
  balance: string | number
}

interface ReferralInfo {
  enabled: boolean
  code: string
  link: string
  commission_rate: string
  invite_count: number
  total_commission: string | number
}

interface CheckInStatus {
  enabled: boolean
  checked_in_today: boolean
  current_streak: number
  today_reward_preview: string
  random_enabled: boolean
  random_min: string
  random_max: string
  next_streak_reward?: { day: number; amount: string }
  currency_display_name: string
}

interface CheckInClaimResult {
  reward_amount: string
  reward_kind: string
  streak_days: number
  balance: string
  currency_display_name: string
}

interface PaymentConfig {
  enabled: boolean
  currency_display_name: string
  usd_to_rmb_rate: string
  min_recharge_amount: string
  recharge_presets: string[]
  methods: string[]
  channels: PaymentChannel[]
}

interface PaymentChannel {
  id: string
  name: string
  provider: string
  methods: string[]
}

interface PaymentOrder {
  order_no: string
  amount: string
  rmb_amount: string
  method: string
  status: string
  payment_url?: string
}

interface SubscriptionPlanInfo {
  id: number
  name: string
  reset_amount: string | number
  reset_interval_days: number
  price: string | number
  duration_days: number
}

interface UserSubscriptionInfo {
  id: number
  balance: string | number
  active_until?: string | null
  next_reset_at: string
  plan: SubscriptionPlanInfo
}

export default function Wallet() {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhWalletCopy : enWalletCopy
  const queryClient = useQueryClient()
  const [redeemCode, setRedeemCode] = useState("")
  const [redeemStatus, setRedeemStatus] = useState("")
  const [copyStatus, setCopyStatus] = useState("")
  const [checkInStatusText, setCheckInStatusText] = useState("")
  const [rechargeAmount, setRechargeAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("alipay")
  const [paymentChannel, setPaymentChannel] = useState("")
  const [paymentStatus, setPaymentStatus] = useState("")
  const [purchaseStatus, setPurchaseStatus] = useState("")
  const [confirmPlanID, setConfirmPlanID] = useState(0)

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
  const publicSettings = withPublicSettingsDefaults(settings)
  const personalMode = isPersonalMode(publicSettings)
  const currency = publicSettings.payment_currency_display_name

  const { data: referralInfo } = useQuery<ReferralInfo>({
    queryKey: ["user-referral"],
    queryFn: async () => {
      const res = await api.get("/user/referral")
      return res.data
    },
  })
  const { data: checkInStatus } = useQuery<CheckInStatus>({
    queryKey: ["check-in-status"],
    queryFn: async () => {
      const res = await api.get("/user/check-in/status")
      return res.data
    },
    enabled: publicSettings.checkin_enabled,
  })
  const { data: subscriptions = [] } = useQuery<UserSubscriptionInfo[]>({
    queryKey: ["my-subscription"],
    queryFn: async () => {
      const res = await api.get("/user/subscription")
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: !personalMode,
  })
  const { data: purchasablePlans = [] } = useQuery<SubscriptionPlanInfo[]>({
    queryKey: ["purchasable-subscription-plans"],
    queryFn: async () => {
      const res = await api.get("/user/subscription-plans")
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: !personalMode,
  })
  const { data: paymentConfig } = useQuery<PaymentConfig>({
    queryKey: ["payment-config"],
    queryFn: async () => {
      const res = await api.get("/user/payment/config")
      return res.data
    },
    enabled: publicSettings.payment_enabled,
  })
  useEffect(() => {
    const methods = paymentConfig?.methods || []
    if (methods.length > 0 && !methods.some((method) => method.toLowerCase() === paymentMethod.toLowerCase())) {
      setPaymentMethod(methods[0])
    }
  }, [paymentConfig?.methods, paymentMethod])
  const availablePaymentChannels = (paymentConfig?.channels || []).filter((channel) => channel.methods.some((method) => method.toLowerCase() === paymentMethod.toLowerCase()))
  useEffect(() => {
    if (availablePaymentChannels.length > 0 && !availablePaymentChannels.some((channel) => channel.id === paymentChannel)) {
      setPaymentChannel(availablePaymentChannels[0].id)
    }
  }, [availablePaymentChannels, paymentChannel])
  const redeemBalance = useMutation({
    mutationFn: async () => {
      const res = await api.post("/user/redeem-code", { code: redeemCode })
      return res.data as { amount: string | number; balance: string | number }
    },
    onSuccess: (result) => {
      setRedeemStatus(t("settings.redeemSuccess", { amount: result.amount }))
      setRedeemCode("")
      queryClient.invalidateQueries({ queryKey: ["me"] })
      queryClient.invalidateQueries({ queryKey: ["stats", "user"] })
    },
    onError: (error) => {
      setRedeemStatus(apiErrorMessage(error, t("settings.redeemFailed")))
    },
  })

  const claimCheckIn = useMutation({
    mutationFn: async () => {
      const res = await api.post("/user/check-in")
      return res.data as CheckInClaimResult
    },
    onSuccess: (result) => {
      setCheckInStatusText(copy.checkInSuccess.replace("{amount}", `${result.currency_display_name}${result.reward_amount}`).replace("{streak}", String(result.streak_days)))
      queryClient.invalidateQueries({ queryKey: ["check-in-status"] })
      queryClient.invalidateQueries({ queryKey: ["me"] })
      queryClient.invalidateQueries({ queryKey: ["stats", "user"] })
    },
    onError: (error) => setCheckInStatusText(apiErrorMessage(error, copy.checkInFailed)),
  })

  const createPaymentOrder = useMutation({
    mutationFn: async () => {
      const method = paymentMethod || paymentConfig?.methods?.[0] || "alipay"
      const channelID = paymentChannel || availablePaymentChannels[0]?.id || ""
      const res = await api.post("/user/payment/orders", { amount: rechargeAmount, method, channel_id: channelID })
      return res.data as PaymentOrder
    },
    onSuccess: (result) => {
      setPaymentStatus(copy.paymentOrderCreated.replace("{order}", result.order_no).replace("{amount}", `${paymentConfig?.currency_display_name || currency}${result.amount}`))
      queryClient.invalidateQueries({ queryKey: ["payment-orders"] })
      if (result.payment_url) {
        window.location.href = result.payment_url
      }
    },
    onError: (error) => setPaymentStatus(apiErrorMessage(error, copy.paymentOrderFailed)),
  })

  const purchaseSubscription = useMutation({
    mutationFn: async (planID: number) => {
      const res = await api.post("/user/subscription/purchase", { plan_id: planID })
      return res.data as { balance: string | number }
    },
    onSuccess: () => {
      setPurchaseStatus(copy.purchaseSuccess)
      setConfirmPlanID(0)
      queryClient.invalidateQueries({ queryKey: ["me"] })
      queryClient.invalidateQueries({ queryKey: ["my-subscription"] })
      queryClient.invalidateQueries({ queryKey: ["stats", "user"] })
    },
    onError: (error) => {
      setPurchaseStatus(apiErrorMessage(error, copy.purchaseFailed))
      setConfirmPlanID(0)
    },
  })

  const copyText = async (value: string) => {
    await navigator.clipboard.writeText(value)
    setCopyStatus(t("settings.keyCopied"))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{copy.title}</h1>
        <div className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</div>
      </div>

      <PageTitleSlot />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WalletCards size={18} />
              {copy.balance}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-semibold">{personalMode ? copy.personalModeBalance : `${currency}${user?.balance || 0}`}</div>
            <div className="mt-2 text-sm text-muted-foreground">{personalMode ? copy.personalModeBalanceDescription : copy.balanceDescription}</div>
          </CardContent>
        </Card>

        {publicSettings.payment_enabled && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard size={18} />
                {copy.rechargeBalance}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {copy.rechargeDescription
                  .replace("{min}", `${paymentConfig?.currency_display_name || currency}${paymentConfig?.min_recharge_amount || publicSettings.payment_min_recharge_amount}`)
                  .replace("{rate}", paymentConfig?.usd_to_rmb_rate || publicSettings.payment_usd_to_rmb_rate)}
              </div>
              <div className="flex flex-wrap gap-2">
                {(paymentConfig?.recharge_presets || parseJSONList(publicSettings.payment_recharge_presets)).map((amount) => (
                  <Button key={amount} type="button" variant={rechargeAmount === amount ? "default" : "outline"} size="sm" onClick={() => setRechargeAmount(amount)}>
                    {paymentConfig?.currency_display_name || currency}{amount}
                  </Button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_160px_180px]">
                <Input value={rechargeAmount} type="number" min="0" placeholder={copy.rechargeAmountPlaceholder} onChange={(event) => setRechargeAmount(event.target.value)} />
                <Select value={String((paymentMethod) || "__shadcn_empty__")} onValueChange={(value) => { setPaymentMethod(value === "__shadcn_empty__" ? "" : value); setPaymentChannel("") }}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  {(paymentConfig?.methods || parseJSONList(publicSettings.payment_methods)).map((method) => (
                    <SelectItem key={method} value={String(method)}>{paymentMethodLabel(method, copy)}</SelectItem>
                  ))}
                </SelectContent></Select>
                <Select value={String(paymentChannel || "__shadcn_empty__")} onValueChange={(value) => setPaymentChannel(value === "__shadcn_empty__" ? "" : value)} disabled={availablePaymentChannels.length === 0}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue placeholder={copy.paymentChannel} /></SelectTrigger><SelectContent>
                  {availablePaymentChannels.map((channel) => <SelectItem key={channel.id} value={channel.id}>{channel.name}</SelectItem>)}
                </SelectContent></Select>
              </div>
              <Button className="w-full gap-2" disabled={!canCreatePaymentOrder(rechargeAmount, paymentConfig, publicSettings) || !paymentChannel || createPaymentOrder.isPending} onClick={() => createPaymentOrder.mutate()}>
                <CreditCard size={16} />
                {copy.createPaymentOrder}
              </Button>
              {paymentStatus && <div className="text-sm text-muted-foreground">{paymentStatus}</div>}
            </CardContent>
          </Card>
        )}
      </div>

      <PageInlineSlot slotKey="primary" />
      <div className="grid gap-4 lg:grid-cols-2">
        {!personalMode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift size={18} />
              {t("settings.redeemCode")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={redeemCode} onChange={(event) => setRedeemCode(event.target.value)} placeholder={t("settings.redeemCodePlaceholder")} />
              <Button className="shrink-0" disabled={!redeemCode.trim() || redeemBalance.isPending} onClick={() => redeemBalance.mutate()}>
                {t("settings.redeem")}
              </Button>
            </div>
            {redeemStatus && <div className="text-sm text-muted-foreground">{redeemStatus}</div>}
          </CardContent>
        </Card>
        )}

        {!personalMode && (subscriptions.length > 0 || purchasablePlans.length > 0) && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package size={18} />
                {copy.subscriptions}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">{copy.mySubscriptions}</div>
                {subscriptions.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{copy.noSubscriptions}</div>
                ) : (
                  subscriptions.map((subscription) => (
                    <div key={subscription.id} className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-[1fr_auto]">
                      <div className="min-w-0 space-y-1">
                        <div className="font-medium">{subscription.plan?.name || "-"}</div>
                        <div className="text-xs text-muted-foreground">
                          {copy.subscriptionQuota
                            .replace("{balance}", `${currency}${subscription.balance}`)
                            .replace("{amount}", `${currency}${subscription.plan?.reset_amount ?? "-"}`)
                            .replace("{days}", String(subscription.plan?.reset_interval_days ?? "-"))}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {copy.subscriptionNextReset.replace("{date}", formatWalletDate(subscription.next_reset_at))}
                          {" · "}
                          {subscription.active_until
                            ? copy.subscriptionActiveUntil.replace("{date}", formatWalletDate(subscription.active_until))
                            : copy.subscriptionPermanent}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {purchasablePlans.length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <div className="text-sm font-medium">{copy.buySubscription}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {purchasablePlans.map((plan) => (
                      <div key={plan.id} className="flex flex-col gap-2 rounded-md border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 truncate font-medium">{plan.name}</div>
                          <div className="shrink-0 text-base font-semibold">{currency}{plan.price}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {copy.planSummary
                            .replace("{amount}", `${currency}${plan.reset_amount}`)
                            .replace("{days}", String(plan.reset_interval_days))}
                          {" · "}
                          {plan.duration_days > 0 ? copy.planDurationDays.replace("{days}", String(plan.duration_days)) : copy.subscriptionPermanent}
                        </div>
                        <Button
                          size="sm"
                          variant={confirmPlanID === plan.id ? "default" : "outline"}
                          disabled={purchaseSubscription.isPending}
                          onClick={() => {
                            if (confirmPlanID === plan.id) {
                              purchaseSubscription.mutate(plan.id)
                            } else {
                              setConfirmPlanID(plan.id)
                              setPurchaseStatus("")
                            }
                          }}
                        >
                          {confirmPlanID === plan.id ? copy.confirmPurchase : copy.purchase}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {purchaseStatus && <div className="text-sm text-muted-foreground">{purchaseStatus}</div>}
            </CardContent>
          </Card>
        )}

        {publicSettings.checkin_enabled && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarCheck size={18} />
                {copy.dailyCheckIn}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <Field label={copy.currentStreak} value={String(checkInStatus?.current_streak || 0)} />
                <Field label={copy.todayReward} value={checkInRewardPreview(checkInStatus, currency)} />
                <Field label={copy.todayStatus} value={checkInStatus?.checked_in_today ? copy.checkedIn : copy.notCheckedIn} />
                <Field label={copy.nextStreakReward} value={nextStreakRewardText(checkInStatus)} />
              </div>
              <Button className="w-full gap-2" disabled={!checkInStatus?.enabled || checkInStatus?.checked_in_today || claimCheckIn.isPending} onClick={() => claimCheckIn.mutate()}>
                <CalendarCheck size={16} />
                {checkInStatus?.checked_in_today ? copy.checkedIn : copy.checkInNow}
              </Button>
              {checkInStatusText && <div className="text-sm text-muted-foreground">{checkInStatusText}</div>}
            </CardContent>
          </Card>
        )}

        {referralInfo?.enabled && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{copy.referral}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={copy.referralCode} value={referralInfo.code || "-"} />
                <Field label={copy.inviteCount} value={String(referralInfo.invite_count || 0)} />
                <Field label={copy.totalCommission} value={`${currency}${referralInfo.total_commission || 0}`} />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={referralInfo.link || ""} readOnly />
                <Button variant="outline" className="shrink-0 gap-2" disabled={!referralInfo.link} onClick={() => copyText(referralInfo.link)}>
                  <Copy size={16} />
                  {t("common.copy")}
                </Button>
              </div>
              {copyStatus && <div className="text-sm text-muted-foreground">{copyStatus}</div>}
            </CardContent>
          </Card>
        )}
      </div>

      <PageInlineSlot slotKey="secondary" />
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-3 last:border-b-0 last:pb-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="min-w-0 truncate text-sm font-medium">{value}</div>
    </div>
  )
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response
    if (response?.data?.error) {
      return response.data.error
    }
  }
  return error instanceof Error ? error.message : fallback
}

function checkInRewardPreview(status: CheckInStatus | undefined, fallbackCurrency: string) {
  if (!status) {
    return "-"
  }
  const currency = status.currency_display_name || fallbackCurrency
  if (status.random_enabled) {
    return `${currency}${status.today_reward_preview}+ (${currency}${status.random_min}~${status.random_max})`
  }
  return `${currency}${status.today_reward_preview}`
}

function nextStreakRewardText(status: CheckInStatus | undefined) {
  if (!status?.next_streak_reward) {
    return "-"
  }
  return `${status.next_streak_reward.day}d +${status.currency_display_name}${status.next_streak_reward.amount}`
}

function formatWalletDate(value?: string | null) {
  if (!value) {
    return "-"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleDateString()
}

function parseJSONList(raw: string) {
  try {
    const parsed = JSON.parse(raw || "[]")
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return raw.split(",").map((item) => item.trim()).filter(Boolean)
  }
}

function canCreatePaymentOrder(amount: string, config: PaymentConfig | undefined, publicSettings: PublicSettings) {
  const value = Number(amount)
  const min = Number(config?.min_recharge_amount || publicSettings.payment_min_recharge_amount || 0)
  return Boolean((config?.enabled ?? publicSettings.payment_enabled) && Number.isFinite(value) && value > 0 && value >= min)
}

function paymentMethodLabel(method: string, copy: typeof zhWalletCopy) {
  switch (method.toLowerCase()) {
    case "alipay":
      return copy.alipay
    case "wxpay":
      return copy.wxpay
    case "wechatpay":
      return copy.wxpay
    case "paypal":
      return "PayPal"
    case "stripe":
      return "Stripe"
    default:
      return method
  }
}

const zhWalletCopy = {
  title: "钱包",
  subtitle: "查看余额、充值、兑换码、签到奖励和资金明细",
  balance: "当前余额",
  balanceDescription: "余额用于 API 调用计费。",
  personalModeBalance: "不限额",
  personalModeBalanceDescription: "当前为自用模式，API 调用不会扣减余额或触发额度限制。",
  rechargeBalance: "余额充值",
  rechargeDescription: "最低充值 {min}，支付按汇率 1 = ¥{rate} 换算人民币。",
  rechargeAmountPlaceholder: "充值金额",
  createPaymentOrder: "创建支付订单",
  paymentOrderCreated: "订单 {order} 已创建，充值 {amount}。正在跳转到支付页面...",
  paymentOrderFailed: "创建支付订单失败",
  paymentChannel: "支付通道",
  subscriptions: "订阅套餐",
  mySubscriptions: "我的订阅",
  noSubscriptions: "暂无订阅",
  subscriptionQuota: "剩余额度 {balance} / 每 {days} 天重置为 {amount}",
  subscriptionNextReset: "下次重置 {date}",
  subscriptionActiveUntil: "有效期至 {date}",
  subscriptionPermanent: "长期有效",
  buySubscription: "购买套餐",
  planSummary: "每 {days} 天重置 {amount} 额度",
  planDurationDays: "时长 {days} 天",
  purchase: "购买",
  confirmPurchase: "确认购买？",
  purchaseSuccess: "购买成功，订阅已生效。",
  purchaseFailed: "购买失败",
  dailyCheckIn: "每日签到",
  currentStreak: "当前连续签到",
  todayReward: "今日奖励",
  todayStatus: "今日状态",
  nextStreakReward: "下个连续奖励",
  checkedIn: "今日已签到",
  notCheckedIn: "今日未签到",
  checkInNow: "立即签到",
  checkInSuccess: "签到成功，获得 {amount}，连续 {streak} 天。",
  checkInFailed: "签到失败",
  referral: "推广返佣",
  referralCode: "推广码",
  inviteCount: "邀请人数",
  totalCommission: "累计返佣",
  details: "钱包明细",
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
  alipay: "支付宝",
  wxpay: "微信支付",
  paid: "已支付",
  pending: "待支付",
}

const enWalletCopy: typeof zhWalletCopy = {
  title: "Wallet",
  subtitle: "Manage balance, recharge, redeem codes, check-in rewards, and wallet details",
  balance: "Current balance",
  balanceDescription: "Balance is used for API call billing.",
  personalModeBalance: "Unlimited",
  personalModeBalanceDescription: "Personal mode is enabled. API calls do not deduct balance or trigger quota limits.",
  rechargeBalance: "Balance recharge",
  rechargeDescription: "Minimum recharge {min}. Payments are converted to RMB at 1 = ¥{rate}.",
  rechargeAmountPlaceholder: "Recharge amount",
  createPaymentOrder: "Create payment order",
  paymentOrderCreated: "Order {order} created for {amount}. Redirecting to payment...",
  paymentOrderFailed: "Failed to create payment order",
  paymentChannel: "Payment channel",
  subscriptions: "Subscriptions",
  mySubscriptions: "My subscriptions",
  noSubscriptions: "No subscriptions yet",
  subscriptionQuota: "Remaining {balance} / resets to {amount} every {days} days",
  subscriptionNextReset: "Next reset {date}",
  subscriptionActiveUntil: "Active until {date}",
  subscriptionPermanent: "No expiry",
  buySubscription: "Buy a plan",
  planSummary: "Resets {amount} every {days} days",
  planDurationDays: "{days} days",
  purchase: "Buy",
  confirmPurchase: "Confirm purchase?",
  purchaseSuccess: "Purchase complete. Subscription is active.",
  purchaseFailed: "Purchase failed",
  dailyCheckIn: "Daily check-in",
  currentStreak: "Current streak",
  todayReward: "Today's reward",
  todayStatus: "Today's status",
  nextStreakReward: "Next streak reward",
  checkedIn: "Checked in today",
  notCheckedIn: "Not checked in",
  checkInNow: "Check in now",
  checkInSuccess: "Check-in succeeded. You received {amount}; streak {streak} days.",
  checkInFailed: "Check-in failed",
  referral: "Referral",
  referralCode: "Referral code",
  inviteCount: "Invites",
  totalCommission: "Total commission",
  details: "Wallet details",
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
  alipay: "Alipay",
  wxpay: "WeChat Pay",
  paid: "Paid",
  pending: "Pending",
}
