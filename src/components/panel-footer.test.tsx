import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PanelFooter } from "@/components/panel-footer"
import type { UpdateStatus } from "@/hooks/use-app-update"

const exportMocks = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  saveMock: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(() => Promise.resolve()),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: exportMocks.invokeMock,
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: exportMocks.saveMock,
}))

const idle: UpdateStatus = { status: "idle" }
const noop = () => {}
const footerProps = { showAbout: false, onShowAbout: noop, onCloseAbout: noop, onUpdateCheck: noop }

describe("PanelFooter", () => {
  beforeEach(() => {
    exportMocks.invokeMock.mockReset()
    exportMocks.saveMock.mockReset()
    exportMocks.invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_usage_history_range") {
        return { fromDate: "2026-06-14", toDate: "2026-06-16", rowCount: 4 }
      }
      if (cmd === "export_usage_history") {
        return { rowCount: 4 }
      }
      return null
    })
    exportMocks.saveMock.mockResolvedValue("/tmp/openusage.csv")
  })

  it("shows countdown in minutes when >= 60 seconds", () => {
    const futureTime = Date.now() + 5 * 60 * 1000 // 5 minutes from now
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={futureTime}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByText("Next update in 5m")).toBeTruthy()
  })

  it("shows countdown in seconds when < 60 seconds", () => {
    const futureTime = Date.now() + 30 * 1000 // 30 seconds from now
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={futureTime}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByText("Next update in 30s")).toBeTruthy()
  })

  it("triggers refresh when clicking countdown label", async () => {
    const futureTime = Date.now() + 5 * 60 * 1000 // 5 minutes from now
    const onRefreshAll = vi.fn()
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={futureTime}
        updateStatus={idle}
        onUpdateInstall={noop}
        onRefreshAll={onRefreshAll}
        {...footerProps}
      />
    )
    const button = screen.getByRole("button", { name: /Next update in/i })
    await userEvent.click(button)
    expect(onRefreshAll).toHaveBeenCalledTimes(1)
  })

  it("shows Paused when autoUpdateNextAt is null", () => {
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByText("Paused")).toBeTruthy()
  })

  it("shows downloading state", () => {
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={{ status: "downloading", progress: 42 }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByText("Downloading update 42%")).toBeTruthy()
  })

  it("shows downloading state without percentage when progress is unknown", () => {
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={{ status: "downloading", progress: -1 }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByText("Downloading update...")).toBeTruthy()
  })

  it("shows restart button when ready", async () => {
    const onInstall = vi.fn()
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={{ status: "ready" }}
        onUpdateInstall={onInstall}
        {...footerProps}
      />
    )
    const button = screen.getByText("Restart to update")
    expect(button).toBeTruthy()
    await userEvent.click(button)
    expect(onInstall).toHaveBeenCalledTimes(1)
  })

  it("shows retryable updates soon state for update check failures", async () => {
    const onUpdateCheck = vi.fn()
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={{ status: "error", message: "Update check failed" }}
        onUpdateInstall={noop}
        showAbout={false}
        onShowAbout={noop}
        onCloseAbout={noop}
        onUpdateCheck={onUpdateCheck}
      />
    )

    const retryButton = screen.getByRole("button", { name: "Updates soon" })
    expect(retryButton).toBeTruthy()
    await userEvent.click(retryButton)
    expect(onUpdateCheck).toHaveBeenCalledTimes(1)
  })

  it("shows error state for non-check failures", () => {
    const { container } = render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={{ status: "error", message: "Download failed" }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(container.textContent).toContain("Update failed")
    expect(screen.queryByRole("button", { name: "Updates soon" })).toBeNull()
  })

  it("shows installing state", () => {
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={{ status: "installing" }}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )
    expect(screen.getByText("Installing...")).toBeTruthy()
  })

  it("opens About dialog when clicking version in idle state", async () => {
    function Harness() {
      const [showAbout, setShowAbout] = useState(false)
      return (
        <PanelFooter
          version="0.0.0"
          autoUpdateNextAt={null}
          updateStatus={idle}
          onUpdateInstall={noop}
          showAbout={showAbout}
          onShowAbout={() => setShowAbout(true)}
          onCloseAbout={() => setShowAbout(false)}
          onUpdateCheck={noop}
        />
      )
    }

    render(<Harness />)
    await userEvent.click(screen.getByRole("button", { name: /OpenUsage/ }))
    expect(screen.getByText("Open source on")).toBeInTheDocument()

    // Close via Escape to exercise AboutDialog onClose path.
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByText("Open source on")).not.toBeInTheDocument()
  })

  it("opens usage export dialog from the footer", async () => {
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Export usage" }))

    expect(await screen.findByText("Export usage")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "From date 06/14/2026" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "To date 06/16/2026" })).toBeInTheDocument()
  })

  it("does not export when the save dialog is cancelled", async () => {
    exportMocks.saveMock.mockResolvedValueOnce(null)
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Export usage" }))
    await userEvent.click(await screen.findByRole("button", { name: "Save" }))

    expect(exportMocks.saveMock).toHaveBeenCalled()
    expect(exportMocks.invokeMock).not.toHaveBeenCalledWith("export_usage_history", expect.anything())
  })

  it("uses an in-panel calendar instead of native date inputs", async () => {
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Export usage" }))

    expect(await screen.findByRole("button", { name: "From date 06/14/2026" })).toBeInTheDocument()
    expect(screen.queryByDisplayValue("2026-06-14")).not.toBeInTheDocument()
  })

  it("keeps the in-panel calendar open while changing months", async () => {
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Export usage" }))
    await userEvent.click(await screen.findByRole("button", { name: "From date 06/14/2026" }))
    await userEvent.click(screen.getByRole("button", { name: "Next month" }))

    expect(screen.getByText("July 2026")).toBeInTheDocument()
    expect(screen.getByRole("grid", { name: "From calendar" })).toBeInTheDocument()
  })

  it("keeps the in-panel calendar compact by rendering only required weeks", async () => {
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Export usage" }))
    await userEvent.click(await screen.findByRole("button", { name: "From date 06/14/2026" }))

    expect(screen.getAllByRole("button", { name: /^Select / })).toHaveLength(35)
    expect(screen.queryByRole("button", { name: "Select 07/11/2026" })).not.toBeInTheDocument()
  })

  it("closes the in-panel calendar after selecting a date", async () => {
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Export usage" }))
    await userEvent.click(await screen.findByRole("button", { name: "From date 06/14/2026" }))
    await userEvent.click(screen.getByRole("button", { name: "Select 06/15/2026" }))

    expect(screen.getByRole("button", { name: "From date 06/15/2026" })).toBeInTheDocument()
    expect(screen.queryByRole("grid", { name: "From calendar" })).not.toBeInTheDocument()
  })

  it("adds extra panel height while the export calendar is open", async () => {
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Export usage" }))
    expect(screen.queryByTestId("usage-export-calendar-spacer")).not.toBeInTheDocument()

    await userEvent.click(await screen.findByRole("button", { name: "From date 06/14/2026" }))
    expect(screen.getByTestId("usage-export-calendar-spacer")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Select 06/15/2026" }))
    expect(screen.queryByTestId("usage-export-calendar-spacer")).not.toBeInTheDocument()
  })

  it("exports Excel with camelCase IPC arguments", async () => {
    exportMocks.saveMock.mockResolvedValueOnce("/tmp/openusage.xlsx")
    render(
      <PanelFooter
        version="0.0.0"
        autoUpdateNextAt={null}
        updateStatus={idle}
        onUpdateInstall={noop}
        {...footerProps}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Export usage" }))
    await userEvent.click(await screen.findByRole("radio", { name: "Excel" }))
    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(exportMocks.invokeMock).toHaveBeenCalledWith("export_usage_history", {
      format: "xlsx",
      fromDate: "2026-06-14",
      toDate: "2026-06-16",
      path: "/tmp/openusage.xlsx",
    })
    expect(await screen.findByText("Exported 4 rows.")).toBeInTheDocument()
  })
})
