import { useEffect, useMemo, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { save } from "@tauri-apps/plugin-dialog"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"

type UsageHistoryRange = {
  fromDate: string | null
  toDate: string | null
  rowCount: number
}

type ExportFormat = "csv" | "xlsx"

type ExportResult = {
  rowCount: number
}

interface UsageExportDialogProps {
  onClose: () => void
  onCalendarOpenChange?: (open: boolean) => void
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

type DateField = "from" | "to"

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function dateToIso(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-")
}

function formatDisplayDate(value: string): string {
  const date = parseIsoDate(value)
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}/${date.getUTCFullYear()}`
}

function monthStart(value: string): Date {
  const date = parseIsoDate(value)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function addMonths(date: Date, offset: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1))
}

function calendarCells(month: Date): Date[] {
  const start = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1))
  start.setUTCDate(start.getUTCDate() - start.getUTCDay())
  const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0))
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()))
  const cellCount = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    return date
  })
}

export function UsageExportDialog({ onClose, onCalendarOpenChange }: UsageExportDialogProps) {
  const [range, setRange] = useState<UsageHistoryRange | null>(null)
  const [fromDate, setFromDate] = useState(todayDate)
  const [toDate, setToDate] = useState(todayDate)
  const [activeDateField, setActiveDateField] = useState<DateField | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => monthStart(todayDate()))
  const [format, setFormat] = useState<ExportFormat>("csv")
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    invoke<UsageHistoryRange>("list_usage_history_range")
      .then((historyRange) => {
        if (cancelled) return
        setRange(historyRange)
        if (historyRange.fromDate) setFromDate(historyRange.fromDate)
        if (historyRange.toDate) setToDate(historyRange.toDate)
      })
      .catch((loadError) => {
        if (cancelled) return
        console.error("Failed to load usage history range:", loadError)
        setError("Could not load export history.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  useEffect(() => {
    onCalendarOpenChange?.(Boolean(activeDateField))
    return () => onCalendarOpenChange?.(false)
  }, [activeDateField, onCalendarOpenChange])

  const canExport = Boolean(range && range.rowCount > 0 && fromDate && toDate && fromDate <= toDate)
  const extension = format === "csv" ? "csv" : "xlsx"
  const defaultPath = useMemo(
    () => `openusage-${fromDate}-to-${toDate}.${extension}`,
    [extension, fromDate, toDate]
  )

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  const openCalendar = (field: DateField) => {
    setActiveDateField(field)
    setCalendarMonth(monthStart(field === "from" ? fromDate : toDate))
  }

  const handleDateSelect = (isoDate: string) => {
    if (activeDateField === "from") {
      setFromDate(isoDate)
    } else if (activeDateField === "to") {
      setToDate(isoDate)
    }
    setActiveDateField(null)
  }

  const isDateDisabled = (isoDate: string): boolean => {
    if (activeDateField === "from") return isoDate > toDate
    if (activeDateField === "to") return isoDate < fromDate
    return false
  }

  const handleExport = async () => {
    if (!canExport) return
    setError(null)
    setSuccess(null)
    setExporting(true)
    try {
      const path = await save({
        defaultPath,
        filters: [
          {
            name: format === "csv" ? "CSV" : "Excel workbook",
            extensions: [extension],
          },
        ],
      })
      if (!path) return

      const result = await invoke<ExportResult>("export_usage_history", {
        format,
        fromDate,
        toDate,
        path,
      })
      setSuccess(`Exported ${result.rowCount} rows.`)
    } catch (exportError) {
      console.error("Failed to export usage history:", exportError)
      setError("Could not export usage history.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-xl"
      onClick={handleBackdropClick}
    >
      <div className="bg-card rounded-lg border shadow-xl p-4 max-w-xs w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold">Export usage</h2>
          </div>
          <Button variant="ghost" size="icon-xs" aria-label="Close export" onClick={onClose}>
            <X className="size-3" />
          </Button>
        </div>

        {loading ? (
          <div className="text-xs text-muted-foreground py-4">Loading history...</div>
        ) : range?.rowCount ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">From</span>
                <button
                  type="button"
                  aria-label={`From date ${formatDisplayDate(fromDate)}`}
                  onClick={() => openCalendar("from")}
                  className="h-8 w-full rounded-md border bg-background px-2 text-left text-xs tabular-nums hover:bg-muted"
                >
                  {formatDisplayDate(fromDate)}
                </button>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">To</span>
                <button
                  type="button"
                  aria-label={`To date ${formatDisplayDate(toDate)}`}
                  onClick={() => openCalendar("to")}
                  className="h-8 w-full rounded-md border bg-background px-2 text-left text-xs tabular-nums hover:bg-muted"
                >
                  {formatDisplayDate(toDate)}
                </button>
              </div>
            </div>

            {activeDateField && (
              <div className="rounded-md border bg-card p-1.5 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Previous month"
                    onClick={() => setCalendarMonth((current) => addMonths(current, -1))}
                  >
                    <ChevronLeft className="size-3" />
                  </Button>
                  <div className="text-xs font-medium">
                    {MONTH_NAMES[calendarMonth.getUTCMonth()]} {calendarMonth.getUTCFullYear()}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Next month"
                    onClick={() => setCalendarMonth((current) => addMonths(current, 1))}
                  >
                    <ChevronRight className="size-3" />
                  </Button>
                </div>
                <div
                  role="grid"
                  aria-label={activeDateField === "from" ? "From calendar" : "To calendar"}
                  className="grid grid-cols-7 gap-0.5"
                >
                  {WEEKDAY_NAMES.map((weekday) => (
                    <div key={weekday} className="h-4 text-center text-[10px] text-muted-foreground">
                      {weekday}
                    </div>
                  ))}
                  {calendarCells(calendarMonth).map((date) => {
                    const isoDate = dateToIso(date)
                    const inMonth = date.getUTCMonth() === calendarMonth.getUTCMonth()
                    const selected = isoDate === (activeDateField === "from" ? fromDate : toDate)
                    const disabled = isDateDisabled(isoDate)
                    return (
                      <button
                        key={isoDate}
                        type="button"
                        aria-label={`Select ${formatDisplayDate(isoDate)}`}
                        disabled={disabled}
                        onClick={() => handleDateSelect(isoDate)}
                        className={[
                          "h-5 rounded text-[11px] tabular-nums transition-colors",
                          selected ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                          inMonth ? "text-foreground" : "text-muted-foreground/50",
                          disabled ? "pointer-events-none opacity-30" : "",
                        ].join(" ")}
                      >
                        {date.getUTCDate()}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Export format">
              <button
                type="button"
                role="radio"
                aria-checked={format === "csv"}
                onClick={() => setFormat("csv")}
                className={`h-7 rounded-md text-xs transition-colors ${format === "csv" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                CSV
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={format === "xlsx"}
                onClick={() => setFormat("xlsx")}
                className={`h-7 rounded-md text-xs transition-colors ${format === "xlsx" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Excel
              </button>
            </div>

            {error && <div className="text-xs text-destructive">{error}</div>}
            {success && <div className="text-xs text-muted-foreground">{success}</div>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="xs" onClick={onClose}>
                Cancel
              </Button>
              <Button size="xs" onClick={handleExport} disabled={!canExport || exporting}>
                {exporting ? "Exporting..." : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground py-3">
              No usage history yet.
            </div>
            {error && <div className="text-xs text-destructive">{error}</div>}
            <div className="flex justify-end">
              <Button variant="outline" size="xs" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
