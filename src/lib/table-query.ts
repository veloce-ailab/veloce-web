import type { TableQuery } from "@/components/ui/table"

export function tableQueryParams(query: TableQuery) {
  return {
    ...(query.sortBy ? { sort_by: query.sortBy, sort_order: query.sortOrder || "asc" } : {}),
    ...Object.fromEntries(Object.entries(query.filters).filter(([, values]) => values.length > 0).map(([key, values]) => [`filter_${key}`, values.join(",")])),
  }
}
