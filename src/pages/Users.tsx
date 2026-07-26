import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Edit, Trash } from "lucide-react"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
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
import EnterprisePeopleManagement from "@/pages/EnterprisePeopleManagement"
import type { PublicSettings } from "@/lib/public-settings"
import { formatCurrency } from "@/lib/currency"
import { withPublicSettingsDefaults } from "@/lib/public-settings"

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
}

interface UserDraft {
  id: number
  username: string
  email: string
  balance: string
  group_id: string
  is_admin: boolean
}

export default function Users() {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const queryClient = useQueryClient()
  const [editingUser, setEditingUser] = useState<UserDraft | null>(null)
  const { success, error } = useToast()
  const { confirm, confirmDialog } = useConfirmDialog()
  const { data: settings } = useQuery<Partial<PublicSettings>>({ queryKey: ["public-settings"], queryFn: async () => (await api.get("/public/settings")).data })
  const publicSettings = withPublicSettingsDefaults(settings)
  const enterpriseMode = String(publicSettings.system_mode || "").toLowerCase() === "enterprise"
  const currency = publicSettings.payment_currency_display_name

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    enabled: settings !== undefined && !enterpriseMode,
    queryFn: async () => {
      const res = await api.get("/users")
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["groups"],
    enabled: settings !== undefined && !enterpriseMode,
    queryFn: async () => {
      const res = await api.get("/groups")
      return Array.isArray(res.data) ? res.data : []
    },
  })

  const updateUser = useMutation({
    mutationFn: async (draft: UserDraft) => {
      const res = await api.put(`/users/${draft.id}`, {
        balance: Number(draft.balance || 0),
        group_id: Number(draft.group_id || 0),
        is_admin: draft.is_admin,
      })
      return res.data
    },
    onSuccess: () => {
      setEditingUser(null)
      success(copy.saved)
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["me"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
    },
    onError: () => error(copy.saveFailed),
  })

  const deleteUser = useMutation({
    mutationFn: async (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => {
      success(copy.deleted)
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
    },
    onError: () => error(copy.deleteFailed),
  })

  if (enterpriseMode) return <EnterprisePeopleManagement />
  return (
    <div className="space-y-6">
      {confirmDialog}
      <div>
        <h1 className="text-3xl font-bold">{t("users.title")}</h1>
      </div>

      <PageTitleSlot />
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.username")}</TableHead>
              <TableHead>{t("common.email")}</TableHead>
              <TableHead>{t("common.group")}</TableHead>
              <TableHead>{t("common.balance")}</TableHead>
              <TableHead>{t("common.admin")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {t("users.noUsers")}
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{groupNames(user)}</TableCell>
                  <TableCell>{formatCurrency(user.balance, currency)}</TableCell>
                  <TableCell>{user.is_admin ? t("common.yes") : t("common.no")}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="icon" title={t("common.edit")} onClick={() => setEditingUser(userToDraft(user))}>
                      <Edit size={14} />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-red-500 hover:text-red-600"
                      title={t("common.delete")}
                      disabled={deleteUser.isPending}
                      onClick={async () => {
                        if (await confirm({ description: copy.confirmDelete.replace("{name}", user.username || user.email) })) {
                          deleteUser.mutate(user.id)
                        }
                      }}
                    >
                      <Trash size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
      <Dialog open={Boolean(editingUser)} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.editUser}</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <label className="block space-y-1 text-sm">
                <span className="font-medium">{t("common.username")}</span>
                <Input value={editingUser.username} disabled />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">{t("common.email")}</span>
                <Input value={editingUser.email} disabled />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">{t("common.balance")}</span>
                <Input
                  type="number"
                  step="0.000001"
                  value={editingUser.balance}
                  onChange={(event) => setEditingUser({ ...editingUser, balance: event.target.value })}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">{copy.primaryGroup}</span>
                <Select value={String((editingUser.group_id) || "__shadcn_empty__")} onValueChange={(value) => setEditingUser({ ...editingUser, group_id: (value === "__shadcn_empty__" ? "" : value) })}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="__shadcn_empty__">{copy.selectGroup}</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>
                  ))}
                </SelectContent></Select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editingUser.is_admin}
                  onChange={(event) => setEditingUser({ ...editingUser, is_admin: event.target.checked })}
                />
                <span>{copy.adminPermission}</span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>{t("common.cancel")}</Button>
            <Button disabled={!editingUser?.group_id || updateUser.isPending} onClick={() => editingUser && updateUser.mutate(editingUser)}>
              {updateUser.isPending ? copy.saving : copy.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function groupNames(user: User) {
  const names = activeGroupMemberships(user)
    .map((membership) => membership.group?.name)
    .filter((name): name is string => Boolean(name))
  if (names.length > 0) {
    return names.join(", ")
  }
  return user.group?.name || "-"
}

function userToDraft(user: User): UserDraft {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    balance: String(user.balance ?? 0),
    group_id: String(user.group_id || user.group?.id || activeGroupMemberships(user)[0]?.group?.id || ""),
    is_admin: user.is_admin,
  }
}

function activeGroupMemberships(user: User) {
  return (user.groups || []).filter((membership) => !membership.expires_at || new Date(membership.expires_at).getTime() > Date.now())
}

const zhCopy = {
  editUser: "编辑用户",
  primaryGroup: "主用户组",
  selectGroup: "选择用户组",
  adminPermission: "管理员权限",
  save: "保存",
  saving: "保存中...",
  saved: "用户已保存",
  saveFailed: "用户保存失败",
  deleted: "用户已删除",
  deleteFailed: "用户删除失败",
  confirmDelete: "确定删除用户 {name} 吗？",
}

const enCopy = {
  editUser: "Edit User",
  primaryGroup: "Primary group",
  selectGroup: "Select group",
  adminPermission: "Admin permission",
  save: "Save",
  saving: "Saving...",
  saved: "User saved",
  saveFailed: "Failed to save user",
  deleted: "User deleted",
  deleteFailed: "Failed to delete user",
  confirmDelete: "Delete user {name}?",
}
