import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, BadgeCheck, Braces, Check, Code2, KeyRound, Layers3, Network, Send, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PublicTopBar } from "@/components/layout/PublicTopBar"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"

export default function Home() {
  const { language } = useI18n()
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const homeIframeURL = publicSettings.home_iframe_url.trim()
  const hasToken = Boolean(localStorage.getItem("token"))
  const labels =
    language === "zh"
      ? {
          dashboard: "进入控制台", login: "登录并开始", catalog: "浏览可用模型", eyebrow: "统一的 AI API 接入", title: "一次接入，灵活调用多种 AI 能力", description: "通过兼容的 API 地址与密钥，将文本、视觉和推理模型接入你的应用。按需选择模型，在同一处管理调用与用量。",
          flowTitle: "从注册到首次调用", featuresTitle: "为你的产品提供稳定的模型入口", exampleTitle: "沿用熟悉的调用方式", footerTitle: "准备好接入了吗？", footerDescription: "创建 API Key 后，即可在你的服务、脚本或自动化工作流中调用模型。",
          steps: [["01", "创建 API Key", "登录控制台，在 API Key 页面创建一枚用于应用调用的密钥。"], ["02", "选择模型", "在模型目录中确认可用模型，并按任务选择合适的能力与价格。"], ["03", "发起请求", "将 Base URL 和 API Key 配置到 SDK、应用服务或自动化工具中。"]],
          features: [["兼容常用 SDK", "使用 OpenAI 兼容接口，现有项目通常只需替换地址和密钥。"], ["模型灵活选择", "针对对话、代码、推理和多模态任务选择合适的模型。"], ["用量清晰可见", "在控制台查看调用记录、余额和令牌使用情况。"]],
        }
      : {
          dashboard: "Dashboard", login: "Sign in to start", catalog: "Browse models", eyebrow: "A unified AI API endpoint", title: "One integration. Flexible access to AI models.", description: "Connect text, vision, and reasoning models to your application through a compatible API endpoint and key. Choose models as needed and manage usage in one place.",
          flowTitle: "From sign-up to first request", featuresTitle: "A dependable model endpoint for your product", exampleTitle: "Use the workflow you already know", footerTitle: "Ready to connect?", footerDescription: "Create an API key, then call models from your service, scripts, or automation workflows.",
          steps: [["01", "Create an API key", "Sign in and create a key for your application from the API Keys page."], ["02", "Choose a model", "Review the available catalog and select the capability and price that fit the task."], ["03", "Send a request", "Configure the Base URL and API key in your SDK, service, or automation tool."]],
          features: [["Compatible with familiar SDKs", "Use an OpenAI-compatible endpoint. Existing projects often only need a new URL and key."], ["Choose the right model", "Select a model for chat, code, reasoning, or multimodal tasks."], ["Usage stays visible", "Review request history, balance, and token usage in the console."]],
        }

  useEffect(() => {
    const referralCode = new URLSearchParams(window.location.search).get("ref")
    if (referralCode) {
      localStorage.setItem("referral_code", referralCode)
    }
  }, [])

  if (homeIframeURL) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <PublicTopBar settings={publicSettings} fixed />
        <main className="min-h-0 flex-1 pt-16">
          <iframe title="home" src={homeIframeURL} className="block h-full w-full border-0" />
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicTopBar settings={publicSettings} />

      {publicSettings.announcement && (
        <div className="border-b bg-muted/50 px-4 py-3 text-sm sm:px-6">
          <div className="mx-auto max-w-6xl whitespace-pre-wrap">{publicSettings.announcement}</div>
        </div>
      )}

      <main className="flex-1">
        <section className="border-b">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_390px] lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <div className="mb-5 flex items-center gap-2 text-sm font-medium text-primary"><Sparkles size={16} />{labels.eyebrow}</div>
              <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{labels.title}</h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">{labels.description}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button className="gap-2" asChild><Link to={hasToken ? "/dashboard" : "/login"}>{hasToken ? labels.dashboard : labels.login}<ArrowRight size={16} /></Link></Button>
                <Button variant="outline" asChild><Link to="/models">{labels.catalog}</Link></Button>
              </div>
            </div>
            <div className="self-center rounded-xl border bg-muted/30 p-5 shadow-sm">
              <div className="flex items-center justify-between border-b pb-4"><span className="font-semibold">{publicSettings.site_name}</span><BadgeCheck className="text-primary" size={19} /></div>
              <div className="space-y-3 py-5 text-sm">
                <FlowRow icon={<Code2 size={17} />} label="Your application" />
                <div className="ml-4 h-4 border-l border-dashed" />
                <FlowRow icon={<Network size={17} />} label="Compatible API endpoint" active />
                <div className="ml-4 h-4 border-l border-dashed" />
                <FlowRow icon={<Layers3 size={17} />} label="AI models" />
              </div>
              <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">API Key authentication · Model selection · Usage tracking</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold">{labels.flowTitle}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">{labels.steps.map(([number, title, text]) => <div key={number} className="rounded-xl border bg-card p-5"><span className="font-mono text-sm text-primary">{number}</span><h3 className="mt-6 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>)}</div>
        </section>

        <section className="border-y bg-muted/30"><div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8"><h2 className="text-2xl font-bold">{labels.featuresTitle}</h2><div className="mt-8 grid gap-8 md:grid-cols-3">{labels.features.map(([title, text], index) => { const Icon = [Braces, Layers3, KeyRound][index]; return <div key={title}><Icon className="text-primary" size={22} /><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div> })}</div></div></section>

        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8"><div><h2 className="text-2xl font-bold">{labels.exampleTitle}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Base URL and API Key are the only essentials. Keep model selection in your request so it can change with the task.</p></div><pre className="overflow-x-auto border bg-zinc-950 p-5 text-sm leading-6 text-zinc-100"><code>{`curl $BASE_URL/v1/chat/completions \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"your-model","messages":[...]}'`}</code></pre></section>

        <section className="border-t"><div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 px-4 py-12 sm:px-6 md:flex-row md:items-center lg:px-8"><div><h2 className="text-2xl font-bold">{labels.footerTitle}</h2><p className="mt-2 text-sm text-muted-foreground">{labels.footerDescription}</p></div><Button className="gap-2" asChild><Link to={hasToken ? "/dashboard" : "/login"}>{hasToken ? labels.dashboard : labels.login}<Send size={16} /></Link></Button></div></section>
      </main>

      {publicSettings.footer_text && (
        <footer className="border-t px-4 py-4 text-center text-sm text-muted-foreground sm:px-6">
          {publicSettings.footer_text}
        </footer>
      )}
    </div>
  )
}

function FlowRow({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${active ? "border-primary/50 bg-primary/10" : "bg-background"}`}><span className="text-primary">{icon}</span><span>{label}</span><Check className="ml-auto text-muted-foreground" size={15} /></div>
}
