'use client';

import { enUS, zhTW } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';

import { useLocale } from '../i18n/index.js';
import { formatDateOnly, parseDateOnly } from '../lib/date-only.js';
import { cn } from '../lib/utils.js';
import { Button } from './ui/button.js';
import { Calendar } from './ui/calendar.js';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.js';

export { formatDateOnly, parseDateOnly } from '../lib/date-only.js';

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

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  disabled,
  className,
}: DatePickerProps) {
  const selected = parseDateOnly(value);
  const locale = useLocale();
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
          {selected ? selected.toLocaleDateString(locale) : placeholder}
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
