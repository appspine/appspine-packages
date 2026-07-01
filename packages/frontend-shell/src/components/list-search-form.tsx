import * as React from 'react';

import { cn } from '../lib/utils.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';

interface ListSearchFormProps
  extends Omit<React.ComponentProps<'form'>, 'children' | 'defaultValue'> {
  readonly defaultValue?: string;
  readonly placeholder?: string;
  readonly searchButtonText: string;
  readonly inputClassName?: string;
}

export function ListSearchForm({
  defaultValue,
  placeholder,
  searchButtonText,
  className,
  inputClassName,
  ...props
}: ListSearchFormProps) {
  return (
    <form className={cn('flex gap-2', className)} {...props}>
      <Input
        name="search"
        placeholder={placeholder}
        defaultValue={defaultValue}
        className={cn('max-w-sm', inputClassName)}
      />
      <Button type="submit" variant="outline">
        {searchButtonText}
      </Button>
    </form>
  );
}
