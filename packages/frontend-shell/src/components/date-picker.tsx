'use client';

import { enUS, zhTW } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';

import { useLocale } from '../i18n/index.js';
import { cn } from '../lib/utils.js';
import { Button } from './ui/button.js';
import { Calendar } from './ui/calendar.js';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.js';

export function useDateFnsLocale() {
  const locale = useLocale();
  return locale === 'zh-TW' ? zhTW : enUS;
}

interface DatePickerProps {
  /** YYYY-MM-DD (also accepts full ISO datetime — only the date portion is used) */
  value?: string;
  onChange?: (value: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function parseDateOnly(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return undefined;
  // Use noon to avoid DST / timezone edge cases flipping the day
  return new Date(y, m - 1, d, 12);
}

export function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  disabled,
  className,
}: DatePickerProps) {
  const selected = parseDateOnly(value);
  const dateFnsLocale = useDateFnsLocale();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected ? selected.toLocaleDateString('zh-TW') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => onChange?.(day ? formatDateOnly(day) : undefined)}
          locale={dateFnsLocale}
        />
      </PopoverContent>
    </Popover>
  );
}
