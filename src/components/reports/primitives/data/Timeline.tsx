'use client'

import { motion } from 'framer-motion'
import type { TimelineProps, TimelineItem } from '#/lib/reports/types'

const dotColors: Record<NonNullable<TimelineItem['variant']>, string> = {
  default: 'bg-[var(--report-accent)]',
  success: 'bg-[var(--report-success)]',
  warning: 'bg-[var(--report-warning)]',
  error: 'bg-[var(--report-error)]',
  info: 'bg-sky-500',
}

const dotOutline: Record<NonNullable<TimelineItem['variant']>, string> = {
  default: 'border-[var(--report-accent)]',
  success: 'border-[var(--report-success)]',
  warning: 'border-[var(--report-warning)]',
  error: 'border-[var(--report-error)]',
  info: 'border-sky-500',
}

export function Timeline({
  items,
  layout = 'vertical',
  variant = 'default',
}: TimelineProps) {
  if (layout === 'horizontal') {
    return (
      <div className="flex overflow-x-auto pb-2">
        {items.map((item, index) => (
          <HorizontalItem
            key={item.id}
            item={item}
            isLast={index === items.length - 1}
            variant={variant}
            index={index}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {items.map((item, index) => (
        <VerticalItem
          key={item.id}
          item={item}
          isLast={index === items.length - 1}
          variant={variant}
          index={index}
        />
      ))}
    </div>
  )
}

function VerticalItem({
  item,
  isLast,
  variant,
  index,
}: {
  item: TimelineItem
  isLast: boolean
  variant: 'default' | 'outlined'
  index: number
}) {
  const dotStyle =
    variant === 'outlined'
      ? `border-2 ${dotOutline[item.variant ?? 'default']} bg-transparent`
      : dotColors[item.variant ?? 'default']

  return (
    <motion.div
      className="flex gap-3"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
    >
      <div className="flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full shrink-0 mt-1.5 ${dotStyle}`} />
        {!isLast && (
          <div className="w-px flex-1 bg-[var(--report-border)] my-1" />
        )}
      </div>
      <div className={`pb-4 flex-1 min-w-0 ${isLast ? '' : ''}`}>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-[var(--report-text)]">
            {item.title}
          </span>
          {item.timestamp && (
            <span className="text-xs text-[var(--report-text-muted)]">
              {item.timestamp}
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-sm text-[var(--report-text-muted)] mt-0.5">
            {item.description}
          </p>
        )}
      </div>
    </motion.div>
  )
}

function HorizontalItem({
  item,
  isLast,
  variant,
  index,
}: {
  item: TimelineItem
  isLast: boolean
  variant: 'default' | 'outlined'
  index: number
}) {
  const dotStyle =
    variant === 'outlined'
      ? `border-2 ${dotOutline[item.variant ?? 'default']} bg-transparent`
      : dotColors[item.variant ?? 'default']

  return (
    <motion.div
      className="flex flex-col items-center shrink-0"
      style={{ width: 140 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
    >
      <div className="flex items-center w-full">
        {!isLast && (
          <div className="flex-1 h-px bg-[var(--report-border)]" />
        )}
        <div className={`w-3 h-3 rounded-full shrink-0 ${dotStyle}`} />
        {!isLast && (
          <div className="flex-1 h-px bg-[var(--report-border)]" />
        )}
      </div>
      <div className="mt-2 text-center w-full">
        <span className="text-sm font-medium text-[var(--report-text)] block truncate">
          {item.title}
        </span>
        {item.timestamp && (
          <span className="text-xs text-[var(--report-text-muted)] block">
            {item.timestamp}
          </span>
        )}
        {item.description && (
          <p className="text-xs text-[var(--report-text-muted)] mt-0.5 line-clamp-2">
            {item.description}
          </p>
        )}
      </div>
    </motion.div>
  )
}
