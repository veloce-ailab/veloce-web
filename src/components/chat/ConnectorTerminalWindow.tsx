import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react"
import { createPortal } from "react-dom"
import { Maximize2, Minimize2, RefreshCw, TerminalSquare, X } from "lucide-react"
import api from "@/lib/api"
import { cn } from "@/lib/utils"

export interface ConnectorTerminalCopy {
  title: string
  connecting: string
  connectFailed: string
  disconnected: string
  inputPlaceholder: string
  inputPlaceholderClosed: string
  maximize: string
  restore: string
  close: string
  restart: string
  clear: string
  truncatedNotice: string
  exitedWithCode: string
}

interface ConnectorTerminalWindowProps {
  deviceID: string
  deviceName: string
  deviceOS?: string
  workspacePath?: string
  copy: ConnectorTerminalCopy
  onClose: () => void
}

interface TerminalOpenResponse {
  terminal_id?: unknown
  shell?: unknown
  cwd?: unknown
  offset?: unknown
}

interface TerminalReadResponse {
  data?: unknown
  offset?: unknown
  alive?: unknown
  truncated?: unknown
  exit_code?: unknown
  exit_message?: unknown
}

type TerminalStatus = "connecting" | "ready" | "exited" | "error"

const minWidth = 420
const minHeight = 260
const defaultWidth = 720
const defaultHeight = 420
const maxTranscriptChars = 200_000
const historyLimit = 100

export function ConnectorTerminalWindow({ deviceID, deviceName, deviceOS, workspacePath, copy, onClose }: ConnectorTerminalWindowProps) {
  const [position, setPosition] = useState(() => initialPosition())
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight })
  const [isMaximized, setIsMaximized] = useState(false)
  const [sessionSeq, setSessionSeq] = useState(0)
  const [terminalID, setTerminalID] = useState("")
  const [shell, setShell] = useState("")
  const [cwd, setCwd] = useState(workspacePath || "")
  const [transcript, setTranscript] = useState("")
  const [status, setStatus] = useState<TerminalStatus>("connecting")
  const [statusDetail, setStatusDetail] = useState("")
  const [command, setCommand] = useState("")
  const [historyIndex, setHistoryIndex] = useState(-1)

  const offsetRef = useRef(0)
  const historyRef = useRef<string[]>([])
  const outputRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const terminalIDRef = useRef("")
  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)

  const appendTranscript = useCallback((text: string) => {
    if (!text) {
      return
    }
    setTranscript((current) => {
      const next = current + text
      return next.length > maxTranscriptChars ? next.slice(next.length - maxTranscriptChars) : next
    })
  }, [])

  // The connector keeps one shell process per terminal id, so this window opens
  // exactly one session and closes it again on unmount or restart.
  useEffect(() => {
    let cancelled = false
    const closeRemote = (id: string) => {
      void api.post("/user/advanced-chat/terminal/close", { connector_device_id: deviceID, terminal_id: id })
    }
    const open = async () => {
      setStatus("connecting")
      setStatusDetail("")
      offsetRef.current = 0
      try {
        const res = await api.post("/user/advanced-chat/terminal/open", {
          connector_device_id: deviceID,
          connector_workspace_path: workspacePath || "",
        })
        const payload = (res.data || {}) as TerminalOpenResponse
        const id = typeof payload.terminal_id === "string" ? payload.terminal_id : ""
        if (!id) {
          throw new Error(copy.connectFailed)
        }
        if (cancelled) {
          closeRemote(id)
          return
        }
        offsetRef.current = typeof payload.offset === "number" ? payload.offset : 0
        terminalIDRef.current = id
        setTerminalID(id)
        setShell(typeof payload.shell === "string" ? payload.shell : "")
        setCwd(typeof payload.cwd === "string" && payload.cwd ? payload.cwd : workspacePath || "")
        setStatus("ready")
      } catch (err) {
        if (!cancelled) {
          setStatus("error")
          setStatusDetail(errorMessage(err, copy.connectFailed))
        }
      }
    }
    void open()
    return () => {
      cancelled = true
      const id = terminalIDRef.current
      if (id) {
        terminalIDRef.current = ""
        closeRemote(id)
      }
    }
  }, [copy.connectFailed, deviceID, sessionSeq, workspacePath])

  // Every read long-polls the connector, so output is drained in a loop instead
  // of on a fixed timer.
  useEffect(() => {
    if (!terminalID || status !== "ready") {
      return
    }
    let cancelled = false
    const drain = async () => {
      while (!cancelled) {
        try {
          const res = await api.get("/user/advanced-chat/terminal/output", {
            params: { connector_device_id: deviceID, terminal_id: terminalID, offset: offsetRef.current },
          })
          if (cancelled) {
            return
          }
          const payload = (res.data || {}) as TerminalReadResponse
          if (payload.truncated === true) {
            appendTranscript(newline(`[${copy.truncatedNotice}]`))
          }
          if (typeof payload.data === "string") {
            appendTranscript(payload.data)
          }
          if (typeof payload.offset === "number") {
            offsetRef.current = payload.offset
          }
          if (payload.alive === false) {
            const detail = typeof payload.exit_message === "string" && payload.exit_message ? payload.exit_message : ""
            const code = typeof payload.exit_code === "number" ? payload.exit_code : undefined
            setStatus("exited")
            setStatusDetail(detail || (code === undefined ? "" : copy.exitedWithCode.replace("{code}", String(code))))
            return
          }
        } catch (err) {
          if (cancelled) {
            return
          }
          setStatus("error")
          setStatusDetail(errorMessage(err, copy.disconnected))
          return
        }
      }
    }
    void drain()
    return () => {
      cancelled = true
    }
  }, [appendTranscript, copy.disconnected, copy.exitedWithCode, copy.truncatedNotice, deviceID, status, terminalID])

  useEffect(() => {
    const element = outputRef.current
    if (element) {
      element.scrollTop = element.scrollHeight
    }
  }, [transcript])

  const sendInput = useCallback(async (data: string) => {
    if (!terminalID || status !== "ready") {
      return
    }
    try {
      await api.post("/user/advanced-chat/terminal/input", {
        connector_device_id: deviceID,
        terminal_id: terminalID,
        data,
      })
    } catch (err) {
      appendTranscript(newline(`[${errorMessage(err, copy.disconnected)}]`))
    }
  }, [appendTranscript, copy.disconnected, deviceID, status, terminalID])

  const submitCommand = () => {
    if (status !== "ready") {
      return
    }
    const text = command
    setCommand("")
    setHistoryIndex(-1)
    if (text.trim()) {
      historyRef.current = [text, ...historyRef.current.filter((item) => item !== text)].slice(0, historyLimit)
    }
    // Local echo: the shell runs without a tty, so it never echoes input back.
    appendTranscript(`${promptLabel(cwd, shell)}${text}${lineBreak}`)
    void sendInput(`${text}${lineBreak}`)
  }

  const restartSession = () => {
    setTranscript("")
    setCommand("")
    setHistoryIndex(-1)
    setTerminalID("")
    setSessionSeq((seq) => seq + 1)
  }

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submitCommand()
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      const next = Math.min(historyIndex + 1, historyRef.current.length - 1)
      if (next >= 0) {
        setHistoryIndex(next)
        setCommand(historyRef.current[next] || "")
      }
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      const next = historyIndex - 1
      setHistoryIndex(next)
      setCommand(next < 0 ? "" : historyRef.current[next] || "")
    }
  }

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Capturing the pointer on the title bar would retarget pointerup away from
    // the title bar buttons and swallow their clicks, so ignore those presses.
    if (isMaximized || event.button !== 0 || (event.target as HTMLElement | null)?.closest("button")) {
      return
    }
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    setPosition(clampPosition(
      drag.originX + (event.clientX - drag.startX),
      drag.originY + (event.clientY - drag.startY),
      size.width
    ))
  }

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current
    if (drag && drag.pointerId === event.pointerId) {
      dragStateRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const statusText = useMemo(() => {
    switch (status) {
      case "connecting":
        return copy.connecting
      case "exited":
        return statusDetail || copy.disconnected
      case "error":
        return statusDetail || copy.connectFailed
      default:
        return ""
    }
  }, [copy.connectFailed, copy.connecting, copy.disconnected, status, statusDetail])

  const frameStyle = isMaximized
    ? { left: 8, top: 8, width: "calc(100vw - 1rem)", height: "calc(100vh - 1rem)" }
    : { left: position.x, top: position.y, width: size.width, height: size.height }

  if (typeof document === "undefined") {
    return null
  }

  return createPortal(
    // A non-modal overlay: the wrapper never takes pointer events, so the chat
    // behind it stays fully usable while the terminal is open.
    <div className="pointer-events-none fixed inset-0 z-[80]" role="dialog" aria-modal={false} aria-label={`${copy.title} · ${deviceName}`}>
      <div
        className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl"
        style={frameStyle}
      >
        <div
          className={cn("flex h-10 shrink-0 items-center gap-2 border-b border-border/80 bg-muted/60 px-3", !isMaximized && "cursor-move")}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          onDoubleClick={(event) => {
            if ((event.target as HTMLElement | null)?.closest("button")) {
              return
            }
            setIsMaximized((maximized) => !maximized)
          }}
        >
          <TerminalSquare size={15} className="shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 items-baseline gap-1.5 text-xs">
            <span className="truncate font-medium">{deviceName || copy.title}</span>
            {shell && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{shell}</span>}
            {deviceOS && <span className="shrink-0 text-[11px] text-muted-foreground">{deviceOS}</span>}
          </div>
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={restartSession}
            aria-label={copy.restart}
            title={copy.restart}
          >
            <RefreshCw size={13} className={status === "connecting" ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setIsMaximized((maximized) => !maximized)}
            aria-label={isMaximized ? copy.restore : copy.maximize}
            title={isMaximized ? copy.restore : copy.maximize}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={onClose}
            aria-label={copy.close}
            title={copy.close}
          >
            <X size={14} />
          </button>
        </div>

        <div
          ref={outputRef}
          className="min-h-0 flex-1 overflow-auto bg-background px-3 py-2 font-mono text-xs leading-relaxed"
          onClick={() => inputRef.current?.focus()}
        >
          <pre className="whitespace-pre-wrap break-words text-foreground">{transcript}</pre>
          {statusText && <div className={cn("mt-1", status === "error" ? "text-destructive" : "text-muted-foreground")}>{statusText}</div>}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-border/80 bg-muted/40 px-3 py-2">
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{promptSymbol(shell)}</span>
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
            value={command}
            disabled={status !== "ready"}
            placeholder={status === "ready" ? copy.inputPlaceholder : copy.inputPlaceholderClosed}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          <button
            type="button"
            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setTranscript("")}
            title={copy.clear}
          >
            {copy.clear}
          </button>
        </div>

        {!isMaximized && (
          <ResizeHandle
            onResize={(deltaX, deltaY) => setSize((current) => ({
              width: Math.max(minWidth, Math.min(current.width + deltaX, window.innerWidth - 32)),
              height: Math.max(minHeight, Math.min(current.height + deltaY, window.innerHeight - 32)),
            }))}
          />
        )}
      </div>
    </div>,
    document.body
  )
}

function ResizeHandle({ onResize }: { onResize: (deltaX: number, deltaY: number) => void }) {
  const lastRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  return (
    <div
      className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return
        }
        lastRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const last = lastRef.current
        if (!last || last.pointerId !== event.pointerId) {
          return
        }
        onResize(event.clientX - last.x, event.clientY - last.y)
        lastRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      }}
      onPointerUp={(event) => {
        if (lastRef.current?.pointerId === event.pointerId) {
          lastRef.current = null
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
    />
  )
}

const lineBreak = String.fromCharCode(10)

function newline(text: string) {
  return `${lineBreak}${text}${lineBreak}`
}

function initialPosition() {
  if (typeof window === "undefined") {
    return { x: 80, y: 80 }
  }
  return clampPosition(
    Math.max(16, window.innerWidth - defaultWidth - 48),
    Math.max(16, window.innerHeight - defaultHeight - 96),
    defaultWidth
  )
}

// Keeps part of the title bar on screen so a window dragged to an edge can
// always be grabbed again.
function clampPosition(x: number, y: number, width: number) {
  if (typeof window === "undefined") {
    return { x, y }
  }
  return {
    x: Math.max(120 - width, Math.min(x, window.innerWidth - 120)),
    y: Math.max(0, Math.min(y, window.innerHeight - 48)),
  }
}

function promptSymbol(shell: string) {
  return shell.toLowerCase().startsWith("cmd") ? ">" : "$"
}

function promptLabel(cwd: string, shell: string) {
  const symbol = promptSymbol(shell)
  return cwd ? `${cwd}${symbol} ` : `${symbol} `
}

function errorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object") {
    const response = (err as { response?: { data?: { error?: unknown; message?: unknown } } }).response
    const detail = response?.data?.error ?? response?.data?.message
    if (typeof detail === "string" && detail.trim()) {
      return detail
    }
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return fallback
}
