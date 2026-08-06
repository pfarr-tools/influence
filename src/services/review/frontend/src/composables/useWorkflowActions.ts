import { computed } from "vue"
import { actionOrder } from "../utils/action-order.js"

export function useWorkflowActions<T extends { action: string }>(actions: T[]) {
  return computed(() =>
    [...actions].sort(
      (left, right) =>
        actionOrder.indexOf(left.action as (typeof actionOrder)[number]) -
        actionOrder.indexOf(right.action as (typeof actionOrder)[number])
    )
  )
}
