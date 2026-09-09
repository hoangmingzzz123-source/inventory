import { Component, type ErrorInfo, type ReactNode } from "react"

type Props = {
  children: ReactNode
  scope?: "app" | "page"
}
type State = {
  error: Error | null
  supportCode: string
  copied: boolean
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, supportCode: "", copied: false }

  static getDerivedStateFromError(error: Error): State {
    return {
      error,
      supportCode: `ERR-${Date.now().toString(36).toUpperCase()}`,
      copied: false,
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV)
      console.error("WarehouseOS render error", error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    const isPage = this.props.scope === "page"
    const copyError = async () => {
      const diagnostic = `${this.state.supportCode}\n${this.state.error?.message ?? "Unknown render error"}`
      try {
        await navigator.clipboard.writeText(diagnostic)
        this.setState({ copied: true })
      } catch {
        // The visible support code can still be copied manually.
      }
    }

    return (
      <main
        className={`flex items-center justify-center bg-slate-50 p-6 ${
          isPage ? "h-full" : "min-h-screen"
        }`}
      >
        <section className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-6 text-center shadow-sm">
          <div
            className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-lg text-red-600"
            aria-hidden="true"
          >
            !
          </div>
          <h1 className="text-base font-semibold text-slate-900">
            Ứng dụng gặp sự cố / Something went wrong
          </h1>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Vui lòng thử lại. Nếu lỗi tiếp diễn, hãy gửi mã hỗ trợ bên dưới cho
            quản trị viên.
          </p>
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-left text-[10px] text-red-700">
            <div className="font-semibold">{this.state.supportCode}</div>
            {import.meta.env.DEV && (
              <div className="mt-1 break-words">{this.state.error.message}</div>
            )}
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => void copyError()}
              className="h-9 rounded-lg border px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {this.state.copied
                ? "Đã sao chép / Copied"
                : "Sao chép lỗi / Copy error"}
            </button>
            <button
              type="button"
              onClick={() =>
                isPage
                  ? this.setState({
                      error: null,
                      supportCode: "",
                      copied: false,
                    })
                  : window.location.reload()
              }
              className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {isPage ? "Thử lại / Retry" : "Tải lại / Reload"}
            </button>
          </div>
        </section>
      </main>
    )
  }
}
