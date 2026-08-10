import * as React from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, EyeOff, Filter, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type TableProps = React.ComponentProps<"table"> & {
  sortable?: boolean
  onQueryChange?: (query: TableQuery) => void
}

type TableSort = { column: number; direction: "asc" | "desc" } | null
export type TableQuery = {
  sortBy?: string
  sortOrder?: "asc" | "desc"
  filters: Record<string, string[]>
}
type TableContextValue = {
  sortable: boolean
  serverSide: boolean
  sort: TableSort
  setSort: (sort: TableSort) => void
  filters: Record<number, string[]>
  setFilter: (column: number, values: string[]) => void
  hiddenColumns: Set<number>
  setColumnHidden: (column: number, hidden: boolean) => void
  columnForElement: (element: HTMLElement | null) => number
  sortKeyForColumn: (column: number) => string
  filterKeyForColumn: (column: number) => string
  labelForColumn: (column: number) => string
  valuesForColumn: (column: number) => string[]
}

const TableContext = React.createContext<TableContextValue | null>(null)

function Table({ className, sortable = true, onQueryChange, ...props }: TableProps) {
  const tableRef = React.useRef<HTMLTableElement>(null)
  const [sort, setSort] = React.useState<TableSort>(null)
  const [filters, setFilters] = React.useState<Record<number, string[]>>({})
  const [hiddenColumns, setHiddenColumns] = React.useState<Set<number>>(new Set())

  React.useEffect(() => {
    const table = tableRef.current
    if (!table || !sortable) return
    const headerRow = table.tHead?.rows[0]
    const body = table.tBodies[0]
    if (!headerRow || !body) return
    const headers = Array.from(headerRow.cells)
    headers.forEach((header, column) => {
      const values = Array.from(body.rows).map((row) => row.cells[column]?.textContent?.trim() || "")
      const sortableColumn = values.some(Boolean)
      header.dataset.sortable = String(sortableColumn)
      header.dataset.sortDirection = sort?.column === column ? sort.direction : ""
      const hidden = hiddenColumns.has(column)
      header.style.display = hidden ? "none" : ""
    })
    Array.from(body.rows).forEach((row) => {
      const matched = onQueryChange ? true : Object.entries(filters).every(([column, allowed]) => allowed.length === 0 || allowed.includes(tableCellText(row.cells[Number(column)])))
      row.style.display = matched ? "" : "none"
      Array.from(row.cells).forEach((cell, column) => { cell.style.display = hiddenColumns.has(column) ? "none" : "" })
    })
    if (!sort || onQueryChange) return
    const rows = Array.from(body.rows).map((row, index) => ({ row, index }))
    rows.sort((left, right) => {
      const comparison = compareTableValues(left.row.cells[sort.column]?.textContent || "", right.row.cells[sort.column]?.textContent || "")
      return comparison === 0 ? left.index - right.index : (sort.direction === "asc" ? comparison : -comparison)
    })
    rows.forEach(({ row }) => body.appendChild(row))
  })

  const sortKeyForColumn = React.useCallback((column: number) => tableRef.current?.tHead?.rows[0]?.cells[column]?.dataset.tableSortKey || "", [])
  const filterKeyForColumn = React.useCallback((column: number) => tableRef.current?.tHead?.rows[0]?.cells[column]?.dataset.tableFilterKey || "", [])
  const notifyQueryChange = React.useCallback((nextSort: TableSort, nextFilters: Record<number, string[]>) => {
    if (!onQueryChange) return
    const filtersByKey: Record<string, string[]> = {}
    Object.entries(nextFilters).forEach(([column, values]) => {
      const key = filterKeyForColumn(Number(column))
      if (key && values.length > 0) filtersByKey[key] = values
    })
    onQueryChange({
      sortBy: nextSort ? sortKeyForColumn(nextSort.column) || undefined : undefined,
      sortOrder: nextSort?.direction,
      filters: filtersByKey,
    })
  }, [filterKeyForColumn, onQueryChange, sortKeyForColumn])

  const context = React.useMemo<TableContextValue>(() => ({
    sortable,
    serverSide: Boolean(onQueryChange),
    sort,
    setSort: (nextSort) => {
      setSort(nextSort)
      notifyQueryChange(nextSort, filters)
    },
    filters,
    setFilter: (column, values) => {
      const nextFilters = { ...filters, [column]: values }
      setFilters(nextFilters)
      notifyQueryChange(sort, nextFilters)
    },
    hiddenColumns,
    setColumnHidden: (column, hidden) => setHiddenColumns((current) => { const next = new Set(current); if (hidden) next.add(column); else next.delete(column); return next }),
    columnForElement: (element) => {
      const header = element?.closest("th")
      return header ? Array.from(header.parentElement?.children || []).indexOf(header) : -1
    },
    sortKeyForColumn,
    filterKeyForColumn,
    labelForColumn: (column) => tableRef.current?.tHead?.rows[0]?.cells[column]?.textContent?.trim() || "",
    valuesForColumn: (column) => {
      const body = tableRef.current?.tBodies[0]
      if (!body || column < 0) return []
      return Array.from(new Set(Array.from(body.rows).map((row) => tableCellText(row.cells[column])).filter(Boolean))).sort((a, b) => compareTableValues(a, b))
    },
  }), [filterKeyForColumn, filters, hiddenColumns, notifyQueryChange, onQueryChange, sortKeyForColumn, sort, sortable])

  return (
    <TableContext.Provider value={context}><div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        ref={tableRef}
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
      {hiddenColumns.size > 0 && <HiddenColumnsMenu table={context} />}
    </div></TableContext.Provider>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, children, queryKey, sortKey = queryKey, filterKey = queryKey, ...props }: React.ComponentProps<"th"> & { queryKey?: string; sortKey?: string; filterKey?: string }) {
  const table = React.useContext(TableContext)
  const headerRef = React.useRef<HTMLTableCellElement>(null)
  const [column, setColumn] = React.useState(-1)
  const [interactive, setInteractive] = React.useState(() => containsHeaderControl(children))
  React.useLayoutEffect(() => {
    setColumn(table?.columnForElement(headerRef.current) ?? -1)
    setInteractive(Boolean(headerRef.current?.querySelector("button:not([data-table-column-menu]),input,[role=checkbox]")))
  }, [table])
  const direction = column >= 0 && table?.sort?.column === column ? table.sort.direction : ""
  const content = interactive || !table || (table.serverSide && !sortKey && !filterKey) ? children : <ColumnMenu table={table} column={column} direction={direction} canSort={!table.serverSide || Boolean(sortKey)} canFilter={!table.serverSide || Boolean(filterKey)}>{children}</ColumnMenu>
  return (
    <th
      ref={headerRef}
      data-slot="table-head"
      data-table-sort-key={sortKey}
      data-table-filter-key={filterKey}
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    >{content}</th>
  )
}

function ColumnMenu({ table, column, direction, canSort, canFilter, children }: { table: TableContextValue; column: number; direction: "asc" | "desc" | ""; canSort: boolean; canFilter: boolean; children: React.ReactNode }) {
  const { language } = useI18n()
  const values = table.valuesForColumn(column)
  const selected = table.filters[column] || []
  const label = (zh: string, en: string) => language === "zh" ? zh : en
  const setSort = (next: "asc" | "desc") => { if (column >= 0) table.setSort({ column, direction: next }) }
  const toggleFilter = (value: string) => table.setFilter(column, selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])
  return <DropdownMenu><DropdownMenuTrigger asChild><button data-table-column-menu type="button" className={cn("flex h-9 w-full items-center gap-2 rounded-md px-1 text-left hover:bg-muted/50", direction && "bg-primary/10 text-primary")}><span className="min-w-0 flex-1 truncate">{children}</span>{direction === "asc" ? <ArrowUp className="h-4 w-4 shrink-0" /> : direction === "desc" ? <ArrowDown className="h-4 w-4 shrink-0" /> : <ArrowUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />}</button></DropdownMenuTrigger><DropdownMenuContent className="w-64" align="start">{canSort && <><DropdownMenuItem onSelect={() => setSort("asc")}><ArrowUp />{label("升序", "Sort ascending")}</DropdownMenuItem><DropdownMenuItem onSelect={() => setSort("desc")}><ArrowDown />{label("降序", "Sort descending")}</DropdownMenuItem></>}{canFilter && values.length > 0 && <><DropdownMenuSeparator /><DropdownMenuSub><DropdownMenuSubTrigger><Filter />{label("筛选", "Filter")}</DropdownMenuSubTrigger><DropdownMenuSubContent className="max-h-72 w-64 overflow-y-auto">{values.slice(0, 50).map((value) => <DropdownMenuCheckboxItem key={value} checked={selected.includes(value)} onCheckedChange={() => toggleFilter(value)}>{value}</DropdownMenuCheckboxItem>)}{selected.length > 0 && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => table.setFilter(column, [])}><X />{label("清除筛选", "Clear filter")}</DropdownMenuItem></>}</DropdownMenuSubContent></DropdownMenuSub></>}<DropdownMenuSeparator /><DropdownMenuItem onSelect={() => table.setColumnHidden(column, true)}><EyeOff />{label("隐藏", "Hide")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
}

function HiddenColumnsMenu({ table }: { table: TableContextValue }) {
  const { language } = useI18n()
  return <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="icon" variant="outline" className="absolute right-2 top-2 z-10 h-8 w-8" title={language === "zh" ? "显示隐藏列" : "Show hidden columns"}><Columns3 size={15} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{Array.from(table.hiddenColumns).map((column) => <DropdownMenuItem key={column} onSelect={() => table.setColumnHidden(column, false)}>{table.labelForColumn(column) || (language === "zh" ? "未命名列" : "Unnamed column")}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
}

function compareTableValues(left: string, right: string) {
  const leftDate = Date.parse(left)
  const rightDate = Date.parse(right)
  if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate) && /[-/:]/.test(left + right)) return leftDate - rightDate
  const leftNumber = tableNumber(left)
  const rightNumber = tableNumber(right)
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
}

function tableCellText(cell?: HTMLTableCellElement) {
  return cell?.textContent?.trim() || ""
}

function containsHeaderControl(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some((child) => {
    if (!React.isValidElement(child)) return false
    const props = child.props as { checked?: unknown; onCheckedChange?: unknown; children?: React.ReactNode }
    return "checked" in props || "onCheckedChange" in props || containsHeaderControl(props.children)
  })
}

function tableNumber(value: string) {
  const normalized = value.replace(/,/g, "").replace(/[^0-9+-.]/g, "")
  if (!normalized || !/[0-9]/.test(normalized)) return null
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
