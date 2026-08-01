import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ClipboardEvent as ReactClipboardEvent, DragEvent as ReactDragEvent, FormEvent as ReactFormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react"
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

export function ConnectorTerminalWindow({ deviceID, deviceName, deviceOS, workspacePath, copy, onClose }: ConnectorTerminalWindowProps) {
  const [position, setPosition] = useState(() => initialPosition())
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight })
  const [isMaximized, setIsMaximized] = useState(false)
  const [sessionSeq, setSessionSeq] = useState(0)
  const [terminalID, setTerminalID] = useState("")
  const [shell, setShell] = useState("")
  const [transcript, setTranscript] = useState("")
  const [status, setStatus] = useState<TerminalStatus>("connecting")
  const [statusDetail, setStatusDetail] = useState("")

  const offsetRef = useRef(0)
  const outputRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const terminalIDRef = useRef("")
  const inputQueueRef = useRef(Promise.resolve())
  const outputDecoderRef = useRef(new TextDecoder())
  const terminalSizeRef = useRef("")
  const resizeTimerRef = useRef<number | null>(null)
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
      outputDecoderRef.current = new TextDecoder()
      terminalSizeRef.current = ""
      try {
        const initialSize = terminalDimensions(defaultWidth, defaultHeight)
        const res = await api.post("/user/advanced-chat/terminal/open", {
          connector_device_id: deviceID,
          connector_workspace_path: workspacePath || "",
          cols: initialSize.cols,
          rows: initialSize.rows,
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
            appendTranscript(outputDecoderRef.current.decode(base64ToBytes(payload.data), { stream: true }))
          }
          if (typeof payload.offset === "number") {
            offsetRef.current = payload.offset
          }
          if (payload.alive === false) {
            appendTranscript(outputDecoderRef.current.decode())
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

  // Keep the remote pseudo terminal aligned with the visible window. Its size
  // determines line wrapping and full-screen programs such as vim or top.
  useEffect(() => {
    if (!terminalID || status !== "ready") {
      return
    }
    const syncSize = () => {
      const frame = frameRef.current
      if (!frame) {
        return
      }
      const bounds = frame.getBoundingClientRect()
      const { cols, rows } = terminalDimensions(bounds.width, bounds.height)
      const signature = `${terminalID}:${cols}:${rows}`
      if (terminalSizeRef.current === signature) {
        return
      }
      terminalSizeRef.current = signature
      void api.post("/user/advanced-chat/terminal/resize", {
        connector_device_id: deviceID,
        terminal_id: terminalID,
        cols,
        rows,
      }).catch(() => {
        // A resize failure does not invalidate the terminal session.
      })
    }
    const scheduleSync = () => {
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current)
      }
      resizeTimerRef.current = window.setTimeout(syncSize, 80)
    }
    scheduleSync()
    window.addEventListener("resize", scheduleSync)
    return () => {
      window.removeEventListener("resize", scheduleSync)
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current)
        resizeTimerRef.current = null
      }
    }
  }, [deviceID, isMaximized, size.height, size.width, status, terminalID])

  useEffect(() => {
    const element = outputRef.current
    if (element) {
      element.scrollTop = element.scrollHeight
    }
  }, [transcript])

  const sendInput = useCallback((data: string) => {
    if (!terminalID || status !== "ready" || !data) {
      return
    }
    const encoded = bytesToBase64(new TextEncoder().encode(data))
    inputQueueRef.current = inputQueueRef.current.then(async () => {
      await api.post("/user/advanced-chat/terminal/input", {
        connector_device_id: deviceID,
        terminal_id: terminalID,
        data: encoded,
      })
    }).catch((err) => {
      appendTranscript(newline(`[${errorMessage(err, copy.disconnected)}]`))
    })
  }, [appendTranscript, copy.disconnected, deviceID, status, terminalID])

  const restartSession = () => {
    setTranscript("")
    setTerminalID("")
    setSessionSeq((seq) => seq + 1)
  }

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return
    }
    const data = terminalKeyData(event)
    if (data === null) {
      return
    }
    event.preventDefault()
    sendInput(data)
  }

  const handleInputPaste = (event: ReactClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text")
    if (!text) {
      return
    }
    event.preventDefault()
    sendInput(text)
  }

  const handleInputBeforeInput = (event: ReactFormEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent
    if (nativeEvent.inputType !== "insertText" || !nativeEvent.data) {
      return
    }
    event.preventDefault()
    sendInput(nativeEvent.data)
  }

  const handleInputChange = () => {
    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }

  const handleInputDrop = (event: ReactDragEvent<HTMLInputElement>) => {
    const text = event.dataTransfer.getData("text")
    if (!text) {
      return
    }
    event.preventDefault()
    sendInput(text)
  }

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
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
    <div className="pointer-events-none fixed inset-0 z-[80]" role="dialog" aria-modal={false} aria-label={`${copy.title} · ${deviceName}`}>
      <div ref={frameRef} className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl" style={frameStyle}>
        <div
          className={cn("flex h-10 shrink-0 items-center gap-2 border-b border-border/80 bg-muted/60 px-3", !isMaximized && "cursor-move")}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          onDoubleClick={(event) => {
            if (!(event.target as HTMLElement | null)?.closest("button")) {
              setIsMaximized((maximized) => !maximized)
            }
          }}
        >
          <TerminalSquare size={15} className="shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 items-baseline gap-1.5 text-xs">
            <span className="truncate font-medium">{deviceName || copy.title}</span>
            {shell && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{shell}</span>}
            {deviceOS && <span className="shrink-0 text-[11px] text-muted-foreground">{deviceOS}</span>}
          </div>
          <button type="button" className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" onClick={restartSession} aria-label={copy.restart} title={copy.restart}>
            <RefreshCw size={13} className={status === "connecting" ? "animate-spin" : ""} />
          </button>
          <button type="button" className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setIsMaximized((maximized) => !maximized)} aria-label={isMaximized ? copy.restore : copy.maximize} title={isMaximized ? copy.restore : copy.maximize}>
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button type="button" className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={onClose} aria-label={copy.close} title={copy.close}>
            <X size={14} />
          </button>
        </div>

        <div ref={outputRef} className="min-h-0 flex-1 overflow-auto bg-background px-3 py-2 font-mono text-xs leading-relaxed" onClick={() => inputRef.current?.focus()}>
          <pre className="whitespace-pre-wrap break-words text-foreground">{transcript}</pre>
          {statusText && <div className={cn("mt-1", status === "error" ? "text-destructive" : "text-muted-foreground")}>{statusText}</div>}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-border/80 bg-muted/40 px-3 py-2">
          <input
            ref={inputRef}
            aria-label={copy.title}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
            disabled={status !== "ready"}
            placeholder={status === "ready" ? copy.inputPlaceholder : copy.inputPlaceholderClosed}
            spellCheck={false}
            autoComplete="off"
            onBeforeInput={handleInputBeforeInput}
            onChange={handleInputChange}
            onDrop={handleInputDrop}
            onKeyDown={handleInputKeyDown}
            onPaste={handleInputPaste}
          />
          <button type="button" className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setTranscript("")} title={copy.clear}>
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

function terminalKeyData(event: ReactKeyboardEvent<HTMLInputElement>): string | null {
  if (event.metaKey) {
    return null
  }
  const special: Record<string, string> = {
    Enter: "\r",
    Backspace: "\x7f",
    Tab: "\t",
    Escape: "\x1b",
    ArrowUp: "\x1b[A",
    ArrowDown: "\x1b[B",
    ArrowRight: "\x1b[C",
    ArrowLeft: "\x1b[D",
    Home: "\x1b[H",
    End: "\x1b[F",
    Insert: "\x1b[2~",
    Delete: "\x1b[3~",
    PageUp: "\x1b[5~",
    PageDown: "\x1b[6~",
  }
  if (special[event.key]) {
    return special[event.key]
  }
  if (event.ctrlKey && event.key.length === 1) {
    if (!event.altKey && event.key.toLowerCase() === "v") {
      return null
    }
    const code = event.key.toUpperCase().charCodeAt(0)
    if (code >= 64 && code <= 95) {
      return String.fromCharCode(code - 64)
    }
    return null
  }
  if (event.key.length !== 1 || event.ctrlKey) {
    return null
  }
  return event.altKey ? `\x1b${event.key}` : event.key
}

function terminalDimensions(width: number, height: number) {
  return {
    cols: Math.max(20, Math.min(500, Math.floor((width - 24) / 8.4))),
    rows: Math.max(5, Math.min(200, Math.floor((height - 82) / 17))),
  }
}

function base64ToBytes(encoded: string) {
  const binary = window.atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return window.btoa(binary)
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

function clampPosition(x: number, y: number, width: number) {
  if (typeof window === "undefined") {
    return { x, y }
  }
  return {
    x: Math.max(120 - width, Math.min(x, window.innerWidth - 120)),
    y: Math.max(0, Math.min(y, window.innerHeight - 48)),
  }
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
