import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Ban, Edit, Plus, Search, ShieldCheck, Trash, WalletCards } from "lucide-react"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import { useToast } from "@/components/ui/toast"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import type { PublicSettings } from "@/lib/public-settings"
import { formatCurrency } from "@/lib/currency"
import { withPublicSettingsDefaults } from "@/lib/public-settings"
import { isStaffUser } from "@/lib/roles"

interface Group {
  id: number
  name: string
}

interface UserGroupMembership {
  group?: Group
  expires_at?: string | null
}

interface User {
  id: number
  username: string
  email: string
  group_id?: number
  group?: Group
  groups?: UserGroupMembership[]
  balance: string | number
  is_admin: boolean
  role: string
  is_disabled: boolean
}

interface UserDraft {
  id: number
  username: string
  email: string
  balance: string
  group_id: string
  is_admin: boolean
  role: string
  is_disabled: boolean
}

interface UserCreateDraft {
  username: string
  email: string
  password: string
  balance: string
  group_id: string
  is_admin: boolean
  role: string
}

interface CurrentUser {
  is_admin: boolean
  role?: string
}

type BulkAction = "disable" | "enable" | "delete" | "adjust_balance"

export default function Users() {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const queryClient = useQueryClient()
  const [editingUser, setEditingUser] = useState<UserDraft | null>(null)
  const [creatingUser, setCreatingUser] = useState<UserCreateDraft | null>(null)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedIDs, setSelectedIDs] = useState<number[]>([])
  const [balanceAdjustment, setBalanceAdjustment] = useState("")
  const [isBalanceDialogOpen, setIsBalanceDialogOpen] = useState(false)
  const { success, error } = useToast()
  const { confirm, confirmDialog } = useConfirmDialog()
  const { data: settings } = useQuery<Partial<PublicSettings>>({ queryKey: ["public-settings"], queryFn: async () => (await api.get("/public/settings")).data })
  const publicSettings = withPublicSettingsDefaults(settings)
  const currency = publicSettings.payment_currency_display_name
  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/user/me")).data,
  })
  const canManageRoles = Boolean(currentUser?.is_admin)

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    enabled: settings !== undefined,
    queryFn: async () => {
      const res = await api.get("/users")
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["groups"],
    enabled: settings !== undefined,
    queryFn: async () => {
      const res = await api.get("/groups")
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const visibleUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return users.filter((user) => {
      const matchesSearch = !keyword || [user.id, user.username, user.email].some((value) => String(value).toLowerCase().includes(keyword))
      const matchesRole = roleFilter === "all" || user.role === roleFilter || (roleFilter === "super_admin" && user.is_admin)
      const matchesStatus = statusFilter === "all" || (statusFilter === "disabled" ? user.is_disabled : !user.is_disabled)
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [roleFilter, search, statusFilter, users])

  const selectedCount = selectedIDs.length
  const allVisibleSelected = visibleUsers.length > 0 && visibleUsers.every((user) => selectedIDs.includes(user.id))

  const invalidateUsers = () => {
    queryClient.invalidateQueries({ queryKey: ["users"] })
    queryClient.invalidateQueries({ queryKey: ["me"] })
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
  }

  const updateUser = useMutation({
    mutationFn: async (draft: UserDraft) => {
      const input: Record<string, unknown> = {
        balance: Number(draft.balance || 0),
        group_id: Number(draft.group_id || 0),
        is_disabled: draft.is_disabled,
      }
      if (canManageRoles) {
        input.is_admin = draft.is_admin
        input.role = draft.role
      }
      return (await api.put(`/users/${draft.id}`, input)).data
    },
    onSuccess: () => {
      setEditingUser(null)
      success(copy.saved)
      invalidateUsers()
    },
    onError: () => error(copy.saveFailed),
  })

  const createUser = useMutation({
    mutationFn: async (draft: UserCreateDraft) => {
      const input: Record<string, unknown> = {
        username: draft.username,
        email: draft.email,
        password: draft.password,
        balance: Number(draft.balance || 0),
        group_id: Number(draft.group_id || 0),
      }
      if (canManageRoles) {
        input.is_admin = draft.is_admin
        input.role = draft.role
      }
      return (await api.post("/users", input)).data
    },
    onSuccess: () => {
      setCreatingUser(null)
      success(copy.created)
      invalidateUsers()
    },
    onError: () => error(copy.createFailed),
  })

  const deleteUser = useMutation({
    mutationFn: async (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => {
      success(copy.deleted)
      invalidateUsers()
    },
    onError: () => error(copy.deleteFailed),
  })

  const bulkAction = useMutation({
    mutationFn: async ({ action, amount }: { action: BulkAction; amount?: number }) => api.post("/users/bulk", { ids: selectedIDs, action, amount }),
    onSuccess: (_, variables) => {
      setSelectedIDs([])
      setIsBalanceDialogOpen(false)
      setBalanceAdjustment("")
      success(variables.action === "delete" ? copy.bulkDeleted : variables.action === "disable" ? copy.bulkDisabled : variables.action === "enable" ? copy.bulkEnabled : copy.balanceAdjusted)
      invalidateUsers()
    },
    onError: () => error(copy.bulkFailed),
  })

  const toggleUser = (id: number) => {
    setSelectedIDs((ids) => ids.includes(id) ? ids.filter((selectedID) => selectedID !== id) : [...ids, id])
  }

  const toggleVisibleUsers = () => {
    const visibleIDs = visibleUsers.filter((user) => canManageRoles || !isStaffUser(user)).map((user) => user.id)
    setSelectedIDs((ids) => allVisibleSelected ? ids.filter((id) => !visibleIDs.includes(id)) : [...new Set([...ids, ...visibleIDs])])
  }

  const runBulkAction = async (action: Exclude<BulkAction, "adjust_balance">) => {
    if (selectedCount === 0) return
    const description = action === "delete" ? copy.confirmBulkDelete.replace("{count}", String(selectedCount)) : action === "disable" ? copy.confirmBulkDisable.replace("{count}", String(selectedCount)) : copy.confirmBulkEnable.replace("{count}", String(selectedCount))
    if (await confirm({ description })) {
      bulkAction.mutate({ action })
    }
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">{t("users.title")}</h1>
        <Button className="gap-2" onClick={() => setCreatingUser(emptyCreateDraft(groups))}><Plus />{copy.addUser}</Button>
      </div>

      <PageTitleSlot />
      <div className="flex flex-col gap-3 rounded-md border bg-card p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.searchPlaceholder} className="pl-9" /></div>
        <Select value={roleFilter} onValueChange={setRoleFilter}><SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{copy.allRoles}</SelectItem><SelectItem value="super_admin">超级管理员</SelectItem><SelectItem value="admin">{copy.admins}</SelectItem><SelectItem value="support">客服</SelectItem><SelectItem value="operations">运维</SelectItem><SelectItem value="sales">销售</SelectItem><SelectItem value="user">{copy.members}</SelectItem></SelectContent></Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{copy.allStatuses}</SelectItem><SelectItem value="active">{copy.active}</SelectItem><SelectItem value="disabled">{copy.disabled}</SelectItem></SelectContent></Select>
      </div>

      {selectedCount > 0 && (
        <div className="flex flex-col gap-3 rounded-md border border-primary/25 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium">{copy.selected.replace("{count}", String(selectedCount))}</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" disabled={bulkAction.isPending} onClick={() => void runBulkAction("disable")}><Ban />{copy.disable}</Button>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={bulkAction.isPending} onClick={() => void runBulkAction("enable")}><ShieldCheck />{copy.enable}</Button>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={bulkAction.isPending} onClick={() => setIsBalanceDialogOpen(true)}><WalletCards />{copy.adjustBalance}</Button>
            <Button size="sm" variant="destructive" className="gap-1.5" disabled={bulkAction.isPending} onClick={() => void runBulkAction("delete")}><Trash />{t("common.delete")}</Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><Checkbox checked={allVisibleSelected} onCheckedChange={toggleVisibleUsers} aria-label={copy.selectAll} /></TableHead>
              <TableHead>{t("common.username")}</TableHead>
              <TableHead>{t("common.email")}</TableHead>
              <TableHead>{t("common.group")}</TableHead>
              <TableHead>{t("common.balance")}</TableHead>
              <TableHead>{copy.status}</TableHead>
              <TableHead>{t("common.role")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <EmptyRow columns={8}>{t("common.loading")}</EmptyRow>
            ) : visibleUsers.length === 0 ? (
              <EmptyRow columns={8}>{users.length === 0 ? t("users.noUsers") : copy.noMatches}</EmptyRow>
            ) : visibleUsers.map((user) => (
              <TableRow key={user.id} data-state={selectedIDs.includes(user.id) ? "selected" : undefined}>
                <TableCell><Checkbox checked={selectedIDs.includes(user.id)} onCheckedChange={() => toggleUser(user.id)} disabled={!canManageRoles && isStaffUser(user)} aria-label={copy.selectUser.replace("{name}", user.username)} /></TableCell>
                <TableCell className="font-medium">{user.username}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{groupNames(user)}</TableCell>
                <TableCell>{formatCurrency(user.balance, currency)}</TableCell>
                <TableCell><span className={user.is_disabled ? "text-sm text-destructive" : "text-sm text-emerald-600 dark:text-emerald-400"}>{user.is_disabled ? copy.disabled : copy.active}</span></TableCell>
                <TableCell>{user.is_admin ? "超级管理员" : roleLabel(user.role)}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button variant="outline" size="icon" title={t("common.edit")} disabled={!canManageRoles && isStaffUser(user)} onClick={() => setEditingUser(userToDraft(user))}><Edit size={14} /></Button>
                  <Button variant="outline" size="icon" className="text-red-500 hover:text-red-600" title={t("common.delete")} disabled={deleteUser.isPending || (!canManageRoles && isStaffUser(user))} onClick={async () => {
                    if (await confirm({ description: copy.confirmDelete.replace("{name}", user.username || user.email) })) deleteUser.mutate(user.id)
                  }}><Trash size={14} /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
      <UserEditorDialog title={copy.editUser} draft={editingUser} groups={groups} onChange={setEditingUser} onClose={() => setEditingUser(null)} onSave={() => editingUser && updateUser.mutate(editingUser)} isSaving={updateUser.isPending} canManageRoles={canManageRoles} copy={copy} t={t} />
      <CreateUserDialog draft={creatingUser} groups={groups} onChange={setCreatingUser} onClose={() => setCreatingUser(null)} onSave={() => creatingUser && createUser.mutate(creatingUser)} isSaving={createUser.isPending} canManageRoles={canManageRoles} copy={copy} t={t} />
      <Dialog open={isBalanceDialogOpen} onOpenChange={setIsBalanceDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{copy.adjustBalance}</DialogTitle></DialogHeader>
          <label className="block space-y-1 text-sm"><span className="font-medium">{copy.balanceChange}</span><Input autoFocus type="number" step="0.000001" value={balanceAdjustment} onChange={(event) => setBalanceAdjustment(event.target.value)} placeholder={copy.balanceChangePlaceholder} /><span className="text-xs text-muted-foreground">{copy.balanceChangeHint}</span></label>
          <DialogFooter><Button variant="outline" onClick={() => setIsBalanceDialogOpen(false)}>{t("common.cancel")}</Button><Button disabled={bulkAction.isPending || !Number(balanceAdjustment)} onClick={() => bulkAction.mutate({ action: "adjust_balance", amount: Number(balanceAdjustment) })}>{bulkAction.isPending ? copy.saving : copy.confirm}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function UserEditorDialog({ title, draft, groups, onChange, onClose, onSave, isSaving, canManageRoles, copy, t }: { title: string; draft: UserDraft | null; groups: Group[]; onChange: (draft: UserDraft | null) => void; onClose: () => void; onSave: () => void; isSaving: boolean; canManageRoles: boolean; copy: Copy; t: (key: Parameters<ReturnType<typeof useI18n>["t"]>[0]) => string }) {
  return <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>{draft && <div className="space-y-4"><ReadOnlyUserFields draft={draft} t={t} /><BalanceField value={draft.balance} onChange={(balance) => onChange({ ...draft, balance })} t={t} /><GroupField groups={groups} value={draft.group_id} onChange={(group_id) => onChange({ ...draft, group_id })} copy={copy} />{canManageRoles && <RoleSelect value={draft.role} onChange={(role) => onChange({ ...draft, role })} />}<ToggleFields isAdmin={draft.is_admin} isDisabled={draft.is_disabled} canManageRoles={canManageRoles} onAdminChange={(is_admin) => onChange({ ...draft, is_admin })} onDisabledChange={(is_disabled) => onChange({ ...draft, is_disabled })} copy={copy} /></div>}<DialogFooter><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button disabled={!draft?.group_id || isSaving} onClick={onSave}>{isSaving ? copy.saving : copy.save}</Button></DialogFooter></DialogContent></Dialog>
}

function CreateUserDialog({ draft, groups, onChange, onClose, onSave, isSaving, canManageRoles, copy, t }: { draft: UserCreateDraft | null; groups: Group[]; onChange: (draft: UserCreateDraft | null) => void; onClose: () => void; onSave: () => void; isSaving: boolean; canManageRoles: boolean; copy: Copy; t: (key: Parameters<ReturnType<typeof useI18n>["t"]>[0]) => string }) {
  return <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>{copy.addUser}</DialogTitle></DialogHeader>{draft && <div className="space-y-4"><label className="block space-y-1 text-sm"><span className="font-medium">{t("common.username")}</span><Input autoFocus value={draft.username} onChange={(event) => onChange({ ...draft, username: event.target.value })} /></label><label className="block space-y-1 text-sm"><span className="font-medium">{t("common.email")}</span><Input type="email" value={draft.email} onChange={(event) => onChange({ ...draft, email: event.target.value })} /></label><label className="block space-y-1 text-sm"><span className="font-medium">{copy.password}</span><Input type="password" value={draft.password} onChange={(event) => onChange({ ...draft, password: event.target.value })} /><span className="text-xs text-muted-foreground">{copy.passwordHint}</span></label><BalanceField value={draft.balance} onChange={(balance) => onChange({ ...draft, balance })} t={t} /><GroupField groups={groups} value={draft.group_id} onChange={(group_id) => onChange({ ...draft, group_id })} copy={copy} />{canManageRoles && <><RoleSelect value={draft.role} onChange={(role) => onChange({ ...draft, role })} /><label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.is_admin} onCheckedChange={(checked) => onChange({ ...draft, is_admin: checked === true })} /><span>超级管理员</span></label></>}</div>}<DialogFooter><Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button><Button disabled={!draft?.username.trim() || !draft.email.trim() || draft.password.length < 8 || !draft.group_id || isSaving} onClick={onSave}>{isSaving ? copy.saving : copy.create}</Button></DialogFooter></DialogContent></Dialog>
}

function ReadOnlyUserFields({ draft, t }: { draft: UserDraft; t: (key: Parameters<ReturnType<typeof useI18n>["t"]>[0]) => string }) {
  return <><label className="block space-y-1 text-sm"><span className="font-medium">{t("common.username")}</span><Input value={draft.username} disabled /></label><label className="block space-y-1 text-sm"><span className="font-medium">{t("common.email")}</span><Input value={draft.email} disabled /></label></>
}

function BalanceField({ value, onChange, t }: { value: string; onChange: (value: string) => void; t: (key: Parameters<ReturnType<typeof useI18n>["t"]>[0]) => string }) {
  return <label className="block space-y-1 text-sm"><span className="font-medium">{t("common.balance")}</span><Input type="number" step="0.000001" value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

function GroupField({ groups, value, onChange, copy }: { groups: Group[]; value: string; onChange: (value: string) => void; copy: Copy }) {
  return <label className="block space-y-1 text-sm"><span className="font-medium">{copy.primaryGroup}</span><Select value={value || "__shadcn_empty__"} onValueChange={(next) => onChange(next === "__shadcn_empty__" ? "" : next)}><SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__shadcn_empty__">{copy.selectGroup}</SelectItem>{groups.map((group) => <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>)}</SelectContent></Select></label>
}

function RoleSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="block space-y-1 text-sm"><span className="font-medium">角色</span><Select value={value} onValueChange={onChange}><SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="user">普通用户</SelectItem><SelectItem value="admin">管理员</SelectItem><SelectItem value="support">客服</SelectItem><SelectItem value="operations">运维</SelectItem><SelectItem value="sales">销售</SelectItem></SelectContent></Select></label>
}

function ToggleFields({ isAdmin, isDisabled, canManageRoles, onAdminChange, onDisabledChange, copy }: { isAdmin: boolean; isDisabled: boolean; canManageRoles: boolean; onAdminChange: (value: boolean) => void; onDisabledChange: (value: boolean) => void; copy: Copy }) {
  return <div className="space-y-3">{canManageRoles && <label className="flex items-center gap-2 text-sm"><Checkbox checked={isAdmin} onCheckedChange={(checked) => onAdminChange(checked === true)} /><span>超级管理员</span></label>}<label className="flex items-center gap-2 text-sm"><Checkbox checked={isDisabled} onCheckedChange={(checked) => onDisabledChange(checked === true)} /><span>{copy.disabled}</span></label></div>
}

function EmptyRow({ columns, children }: { columns: number; children: React.ReactNode }) {
  return <TableRow><TableCell colSpan={columns} className="py-8 text-center text-muted-foreground">{children}</TableCell></TableRow>
}

function groupNames(user: User) {
  const names = activeGroupMemberships(user).map((membership) => membership.group?.name).filter((name): name is string => Boolean(name))
  return names.length > 0 ? names.join(", ") : user.group?.name || "-"
}

function userToDraft(user: User): UserDraft {
  return { id: user.id, username: user.username, email: user.email, balance: String(user.balance ?? 0), group_id: String(user.group_id || user.group?.id || activeGroupMemberships(user)[0]?.group?.id || ""), is_admin: user.is_admin, role: user.role || "user", is_disabled: user.is_disabled }
}

function emptyCreateDraft(groups: Group[]): UserCreateDraft {
  return { username: "", email: "", password: "", balance: "0", group_id: String(groups[0]?.id || ""), is_admin: false, role: "user" }
}

function activeGroupMemberships(user: User) {
  return (user.groups || []).filter((membership) => !membership.expires_at || new Date(membership.expires_at).getTime() > Date.now())
}

function roleLabel(role: string) {
  return ({ admin: "管理员", support: "客服", operations: "运维", sales: "销售", user: "普通用户" } as Record<string, string>)[role] || "普通用户"
}

type Copy = typeof zhCopy

const zhCopy = {
  addUser: "添加用户", create: "创建用户", created: "用户已创建", createFailed: "用户创建失败", editUser: "编辑用户", primaryGroup: "主用户组", selectGroup: "选择用户组", adminPermission: "管理员权限", password: "密码", passwordHint: "至少 8 个字符", save: "保存", saving: "保存中...", saved: "用户已保存", saveFailed: "用户保存失败", deleted: "用户已删除", deleteFailed: "用户删除失败", confirmDelete: "确定删除用户 {name} 吗？", searchPlaceholder: "搜索用户名、邮箱或 ID", allRoles: "全部角色", admins: "管理员", members: "普通用户", allStatuses: "全部状态", active: "正常", disabled: "已封禁", status: "状态", noMatches: "没有符合筛选条件的用户", selectAll: "选择当前结果", selectUser: "选择用户 {name}", selected: "已选择 {count} 名用户", disable: "封禁", enable: "解封", adjustBalance: "调整余额", balanceChange: "余额变动", balanceChangePlaceholder: "例如：10 或 -5", balanceChangeHint: "正数增加余额，负数减少余额；余额最低为 0。", confirm: "确认", confirmBulkDisable: "确定封禁选中的 {count} 名用户吗？他们将无法登录或使用 API Key。", confirmBulkEnable: "确定解除选中的 {count} 名用户的封禁吗？", confirmBulkDelete: "确定删除选中的 {count} 名用户吗？此操作无法撤销。", bulkDisabled: "用户已封禁", bulkEnabled: "用户已解封", bulkDeleted: "用户已删除", balanceAdjusted: "余额已调整", bulkFailed: "批量操作失败",
}

const enCopy: Copy = {
  addUser: "Add user", create: "Create user", created: "User created", createFailed: "Failed to create user", editUser: "Edit user", primaryGroup: "Primary group", selectGroup: "Select group", adminPermission: "Admin permission", password: "Password", passwordHint: "At least 8 characters", save: "Save", saving: "Saving...", saved: "User saved", saveFailed: "Failed to save user", deleted: "User deleted", deleteFailed: "Failed to delete user", confirmDelete: "Delete user {name}?", searchPlaceholder: "Search username, email, or ID", allRoles: "All roles", admins: "Admins", members: "Members", allStatuses: "All statuses", active: "Active", disabled: "Disabled", status: "Status", noMatches: "No users match the filters", selectAll: "Select visible users", selectUser: "Select user {name}", selected: "{count} users selected", disable: "Disable", enable: "Enable", adjustBalance: "Adjust balance", balanceChange: "Balance change", balanceChangePlaceholder: "For example: 10 or -5", balanceChangeHint: "Positive values add balance; negative values deduct it. Balance cannot go below zero.", confirm: "Confirm", confirmBulkDisable: "Disable the selected {count} users? They will not be able to sign in or use API keys.", confirmBulkEnable: "Enable the selected {count} users?", confirmBulkDelete: "Delete the selected {count} users? This cannot be undone.", bulkDisabled: "Users disabled", bulkEnabled: "Users enabled", bulkDeleted: "Users deleted", balanceAdjusted: "Balances adjusted", bulkFailed: "Bulk action failed",
}
