'use client';

import { format, subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import * as React from 'react';

import { useDateFnsLocale } from './date-picker.js';
import { Button } from './ui/button.js';
import { Calendar } from './ui/calendar.js';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.js';

export type { DateRange };

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (value: DateRange | undefined) => void;
  placeholder?: string;
  align?: 'start' | 'center' | 'end';
  className?: string;
  disabled?: boolean;
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Select date range',
  align = 'end',
  className,
  disabled,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [internalRange, setInternalRange] = React.useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = subDays(to, 29);
    return { from, to };
  });

  const dateRange = value ?? internalRange;
  const dateFnsLocale = useDateFnsLocale();

  const handleChange = (next: DateRange | undefined) => {
    if (!value) setInternalRange(next);
    onChange?.(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled} className={`font-normal ${className ?? ''}`}>
          {dateRange?.from
            ? dateRange.to
              ? `${format(dateRange.from, 'yyyy/M/d')} - ${format(dateRange.to, 'yyyy/M/d')}`
              : format(dateRange.from, 'yyyy/M/d')
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align={align}>
        <Calendar
          mode="range"
          defaultMonth={dateRange?.from}
          selected={dateRange}
          onSelect={handleChange}
          numberOfMonths={2}
          locale={dateFnsLocale}
        />
      </PopoverContent>
    </Popover>
  );
}
