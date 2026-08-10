import { PanelLeft } from "lucide-react"
import { createContext, useContext, useEffect, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react"
import { cn } from "@/lib/utils"

type SidebarContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggleSidebar: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)
const sidebarStorageKey = "sidebar_state"
const defaultSidebarContext: SidebarContextValue = {
  open: true,
  setOpen: () => undefined,
  toggleSidebar: () => undefined,
}

export function SidebarProvider({ children, defaultOpen = true, className }: { children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    setOpen(localStorage.getItem(sidebarStorageKey) !== "false")
  }, [])

  const updateOpen = (next: boolean) => {
    setOpen(next)
    localStorage.setItem(sidebarStorageKey, String(next))
  }

  return (
    <SidebarContext.Provider value={{ open, setOpen: updateOpen, toggleSidebar: () => updateOpen(!open) }}>
      <div className={cn("group/sidebar-wrapper flex min-h-0 flex-1", className)}>{children}</div>
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  return context ?? defaultSidebarContext
}

export function Sidebar({ children, className, collapsible = "icon" }: { children: ReactNode; className?: string; collapsible?: "icon" | "none" }) {
  const { open } = useSidebar()
  return (
    <aside
      data-sidebar="sidebar"
      data-state={open ? "expanded" : "collapsed"}
      data-collapsible={collapsible}
      className={cn(
        "group/sidebar relative hidden h-full shrink-0 border-r bg-card text-card-foreground transition-[width] duration-200 ease-linear lg:flex",
        collapsible === "icon" && (open ? "w-60" : "w-16"),
        collapsible === "none" && "w-60",
        className,
      )}
    >
      {children}
    </aside>
  )
}

export function SidebarContent({ children, className }: HTMLAttributes<HTMLDivElement>) {
  return <div data-sidebar="content" className={cn("flex min-h-0 flex-1 flex-col", className)}>{children}</div>
}

export function SidebarMenu({ children, className }: HTMLAttributes<HTMLUListElement>) {
  return <ul data-sidebar="menu" className={cn("flex flex-col gap-1", className)}>{children}</ul>
}

export function SidebarMenuItem({ children, className }: HTMLAttributes<HTMLLIElement>) {
  return <li data-sidebar="menu-item" className={className}>{children}</li>
}

export function SidebarMenuButton({ children, className, isActive, tooltip, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { isActive?: boolean; tooltip?: string }) {
  return (
    <button
      data-sidebar="menu-button"
      data-active={isActive ? "true" : "false"}
      title={tooltip}
      className={cn("flex h-10 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-primary data-[active=true]:text-primary-foreground", className)}
      {...props}
    >
      {children}
    </button>
  )
}

export function SidebarTrigger({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { toggleSidebar, open } = useSidebar()
  return (
    <button type="button" aria-label={open ? "Collapse sidebar" : "Expand sidebar"} title={open ? "Collapse sidebar" : "Expand sidebar"} onClick={toggleSidebar} className={cn("inline-flex size-9 items-center justify-center rounded-md border hover:bg-accent", className)} {...props}>
      <PanelLeft className="size-4" />
    </button>
  )
}

export function SidebarRail() {
  const { toggleSidebar } = useSidebar()
  return <button type="button" aria-label="Toggle sidebar" tabIndex={-1} onClick={toggleSidebar} className="absolute right-0 top-0 hidden h-full w-1 translate-x-1/2 cursor-col-resize rounded-full opacity-0 transition-opacity group-hover/sidebar:opacity-100 lg:block" />
}
