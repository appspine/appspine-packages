'use client';

import { format } from 'date-fns';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import * as React from 'react';

import { useDateFnsLocale } from './date-picker.js';
import { Button } from './ui/button.js';
import { Calendar } from './ui/calendar.js';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js';

interface DateTimePickerProps {
  readonly name?: string;
  readonly placeholder?: string;
  readonly value?: Date;
  readonly onChange?: (date: Date | undefined) => void;
}

export function DateTimePicker({
  name,
  placeholder = 'Select date & time',
  value,
  onChange,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [internalDate, setInternalDate] = React.useState<Date | undefined>(value);
  const dateFnsLocale = useDateFnsLocale();

  const date = value ?? internalDate;

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) return;

    const newDate = new Date(selectedDate);
    if (date) {
      newDate.setHours(date.getHours());
      newDate.setMinutes(date.getMinutes());
      newDate.setSeconds(0);
      newDate.setMilliseconds(0);
    } else {
      newDate.setHours(12);
      newDate.setMinutes(0);
      newDate.setSeconds(0);
      newDate.setMilliseconds(0);
    }

    if (value === undefined) {
      setInternalDate(newDate);
    }
    onChange?.(newDate);
  };

  const handleHourChange = (hourStr: string) => {
    const hours = parseInt(hourStr, 10);
    const newDate = date ? new Date(date) : new Date();
    newDate.setHours(hours);
    newDate.setSeconds(0);
    newDate.setMilliseconds(0);
    if (value === undefined) {
      setInternalDate(newDate);
    }
    onChange?.(newDate);
  };

  const handleMinuteChange = (minuteStr: string) => {
    const minutes = parseInt(minuteStr, 10);
    const newDate = date ? new Date(date) : new Date();
    newDate.setMinutes(minutes);
    newDate.setSeconds(0);
    newDate.setMilliseconds(0);
    if (value === undefined) {
      setInternalDate(newDate);
    }
    onChange?.(newDate);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (value === undefined) {
      setInternalDate(undefined);
    }
    onChange?.(undefined);
  };

  const hours = date ? date.getHours() : 12;
  const minutes = date ? date.getMinutes() : 0;

  const hourOptions = Array.from({ length: 24 }, (_, i) => ({
    value: i.toString(),
    label: i.toString().padStart(2, '0'),
  }));

  const minuteOptions = Array.from({ length: 60 }, (_, i) => ({
    value: i.toString(),
    label: i.toString().padStart(2, '0'),
  }));

  const buttonLabel = date ? format(date, 'yyyy-MM-dd HH:mm') : placeholder;

  return (
    <div className="relative w-full max-w-sm">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-8 w-full justify-start pr-8 text-left font-normal">
            <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
            <span className="flex-1 truncate">{buttonLabel}</span>
          </Button>
        </PopoverTrigger>
        {date && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-1/2 right-2 inline-flex -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0.5 hover:bg-muted"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
        <PopoverContent className="flex w-auto flex-col p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            locale={dateFnsLocale}
          />
          <div className="flex items-center gap-2 border-border border-t p-3">
            <span className="text-muted-foreground text-xs">Time:</span>
            <div className="flex flex-1 items-center gap-1">
              <Select value={hours.toString()} onValueChange={handleHourChange}>
                <SelectTrigger size="sm" className="h-7 w-[70px]">
                  <SelectValue placeholder="HH" />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-48">
                  {hourOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-xs">:</span>
              <Select value={minutes.toString()} onValueChange={handleMinuteChange}>
                <SelectTrigger size="sm" className="h-7 w-[70px]">
                  <SelectValue placeholder="MM" />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-48">
                  {minuteOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {/* Hidden input to participate in native form submit */}
      {date && <input type="hidden" name={name} value={date.toISOString()} />}
    </div>
  );
}
