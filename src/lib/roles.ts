export type UserRole = "user" | "admin" | "support" | "operations" | "sales"

export interface RoleUser {
  is_admin?: boolean
  role?: string
}

export type AdminArea = "admin" | "tickets" | "operations" | "sales" | "overview"

export function normalizedRole(user?: RoleUser | null): UserRole {
  const role = String(user?.role || "").toLowerCase()
  return role === "admin" || role === "support" || role === "operations" || role === "sales" ? role : "user"
}

export function canAccessAdminArea(user: RoleUser | null | undefined, area: AdminArea): boolean {
  if (user?.is_admin || normalizedRole(user) === "admin") return true
  const role = normalizedRole(user)
  if (area === "tickets") return role === "support" || role === "operations" || role === "sales"
  if (area === "operations") return role === "operations"
  if (area === "sales") return role === "sales"
  return false
}

export function isStaffUser(user: RoleUser | null | undefined): boolean {
  return Boolean(user?.is_admin) || normalizedRole(user) !== "user"
}
