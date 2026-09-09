export type AppToastType = "success" | "error" | "info"

export const APP_TOAST_EVENT = "warehouseos:toast"
export const APP_CONFIRM_EVENT = "warehouseos:confirm"

export type AppConfirmRequest = {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  resolve: (confirmed: boolean) => void
}

export function showAppToast(message: unknown, type: AppToastType = "error") {
  const msg = message instanceof Error ? message.message : String(message ?? "")
  if (!msg || typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent(APP_TOAST_EVENT, { detail: { msg, type } }),
  )
}

export function confirmAppAction(
  message: string,
  options: Omit<AppConfirmRequest, "message" | "resolve"> = {},
) {
  if (typeof window === "undefined") return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(
      new CustomEvent(APP_CONFIRM_EVENT, {
        detail: { message, ...options, resolve } satisfies AppConfirmRequest,
      }),
    )
  })
}
