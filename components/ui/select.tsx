"use client";

import * as RS from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Select bám design system Mistral (thay dropdown native cho đồng bộ). Data-driven: truyền
 * items (phẳng) hoặc groups (nhóm theo tiêu đề). Radix + portal → không bị cắt trong modal,
 * có bàn phím + a11y. Radix cấm value="" nên "xóa chọn" dùng sentinel nội bộ → trả về "".
 */

export type SelectOption = { value: string; label: string };
export type SelectGroup = { label: string; items: SelectOption[] };

const CLEAR = "__clear__";

export function Select({
  value,
  onValueChange,
  placeholder,
  items,
  groups,
  clearLabel,
  disabled,
  ariaLabel,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  items?: SelectOption[];
  groups?: SelectGroup[];
  /** Nếu có → thêm mục đầu để bỏ chọn (trả về ""). */
  clearLabel?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <RS.Root
      value={value}
      onValueChange={(v) => onValueChange(v === CLEAR ? "" : v)}
      disabled={disabled}
    >
      <RS.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-11 w-full items-center justify-between gap-sm rounded-md border border-hairline-strong bg-canvas px-md text-sm text-ink",
          "data-[placeholder]:text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <RS.Value placeholder={placeholder} />
        <RS.Icon>
          <ChevronDown className="h-4 w-4 shrink-0 text-steel" />
        </RS.Icon>
      </RS.Trigger>

      <RS.Portal>
        <RS.Content
          position="popper"
          sideOffset={4}
          className="z-[70] max-h-[min(20rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-hairline-soft bg-canvas shadow-modal"
        >
          <RS.Viewport className="p-xs">
            {clearLabel && <Item value={CLEAR} label={clearLabel} />}
            {items?.map((it) => (
              <Item key={it.value} value={it.value} label={it.label} />
            ))}
            {groups?.map((g) => (
              <RS.Group key={g.label}>
                <RS.Label className="px-md py-xxs text-xs font-medium text-steel">{g.label}</RS.Label>
                {g.items.map((it) => (
                  <Item key={it.value} value={it.value} label={it.label} />
                ))}
              </RS.Group>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}

function Item({ value, label }: SelectOption) {
  return (
    <RS.Item
      value={value}
      className="relative flex cursor-pointer select-none items-center rounded-md py-sm pl-md pr-8 text-sm text-ink outline-none data-[highlighted]:bg-surface data-[state=checked]:font-medium data-[state=checked]:text-primary"
    >
      <RS.ItemText>{label}</RS.ItemText>
      <RS.ItemIndicator className="absolute right-2 inline-flex">
        <Check className="h-4 w-4 text-primary" />
      </RS.ItemIndicator>
    </RS.Item>
  );
}
