"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Select } from "@base-ui/react/select";
import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown, Search } from "lucide-react";
import styles from "./GlideSelect.module.css";

export interface GlideOption<Value extends string = string> {
  value: Value;
  label: string;
  tag?: string;
  disabled?: boolean;
  group?: string;
  content?: ReactNode;
}

export interface GlideSelectProps<Value extends string = string> {
  options: readonly GlideOption<Value>[];
  value?: Value;
  defaultValue?: Value;
  onChange?: (value: Value, option: GlideOption<Value>) => void;
  ariaLabel: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerContent?: ReactNode;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    ariaLabel: string;
  };
  menuHeader?: ReactNode;
  menuStatus?: ReactNode;
  menuFooter?: ReactNode;
  emptyMessage?: ReactNode;
  loading?: boolean;
  showTags?: boolean;
  accentColor?: string;
  surfaceColor?: string;
  highlightColor?: string;
  textColor?: string;
  size?: "sm" | "md";
  radius?: number;
  menuWidth?: number;
  placement?: "top" | "bottom";
  align?: "left" | "right";
  popDuration?: number;
  glideDuration?: number;
  rememberPosition?: boolean;
}

/** Kite's local implementation of the user-supplied GlideSelect interface. */
export default function GlideSelect<Value extends string = string>({
  options,
  value,
  defaultValue,
  onChange,
  ariaLabel,
  disabled = false,
  id,
  name,
  required = false,
  className = "",
  open,
  onOpenChange,
  triggerContent,
  search,
  menuHeader,
  menuStatus,
  menuFooter,
  emptyMessage = "No options available.",
  loading = false,
  showTags = false,
  accentColor = "var(--accent)",
  surfaceColor = "var(--surface)",
  highlightColor = "var(--raised)",
  textColor = "var(--ink)",
  size = "md",
  radius = 10,
  menuWidth = 176,
  placement = "bottom",
  align = "left",
  popDuration = 180,
  glideDuration = 220,
  rememberPosition = true,
}: GlideSelectProps<Value>) {
  const [internalOpen, setInternalOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [list, setList] = useState<HTMLDivElement | null>(null);
  const [highlight, setHighlight] = useState<{
    top: number;
    height: number;
  } | null>(null);
  const lastHighlight = useRef<typeof highlight>(null);

  useEffect(() => {
    if (disabled) setInternalOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!list) return;
    const update = () => {
      const item =
        list.querySelector<HTMLElement>("[data-highlighted]") ??
        list.querySelector<HTMLElement>("[data-selected]");
      if (!item) {
        setHighlight(null);
        return;
      }
      // Offset within the list stays correct while its options scroll vertically.
      const next = { top: item.offsetTop, height: item.offsetHeight };
      lastHighlight.current = next;
      setHighlight((previous) =>
        previous?.top === next.top && previous.height === next.height
          ? previous
          : next,
      );
    };
    const observer = new MutationObserver(update);
    const resize = new ResizeObserver(update);
    observer.observe(list, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["data-highlighted", "data-selected"],
    });
    resize.observe(list);
    update();
    return () => {
      observer.disconnect();
      resize.disconnect();
    };
  }, [list]);

  const theme = {
    "--glide-accent": accentColor,
    "--glide-surface": surfaceColor,
    "--glide-highlight": highlightColor,
    "--glide-text": textColor,
    "--glide-radius": `${radius}px`,
    "--glide-menu-width": `${menuWidth}px`,
    "--glide-pop-duration": `${popDuration}ms`,
    "--glide-duration": `${glideDuration}ms`,
  } as CSSProperties;

  const handleOpenChange = (next: boolean) => {
    setInternalOpen(next);
    if (next) setHighlight(rememberPosition ? lastHighlight.current : null);
    onOpenChange?.(next);
  };
  const handleValueChange = (next: Value | null) => {
    const option = options.find((item) => item.value === next);
    if (option && !option.disabled) onChange?.(option.value, option);
  };
  const Parts = search ? Combobox : Select;
  const groups = new Map<string, GlideOption<Value>[]>();
  for (const option of options) {
    const group = option.group ?? "";
    const entries = groups.get(group) ?? [];
    entries.push(option);
    groups.set(group, entries);
  }
  const renderItem = (option: GlideOption<Value>) => (
    <Parts.Item
      key={option.value}
      value={option.value}
      disabled={option.disabled}
      className={`${styles.item} ${option.content ? styles.richItem : ""}`}
      {...(!search ? { label: option.label } : {})}
    >
      {search ? (
        <span className={styles.label}>{option.content ?? option.label}</span>
      ) : (
        <Select.ItemText className={styles.label}>
          {option.content ?? option.label}
        </Select.ItemText>
      )}
      {showTags && option.tag && (
        <span className={styles.tag}>{option.tag}</span>
      )}
      <Parts.ItemIndicator className={styles.check}>
        <Check size={15} aria-hidden="true" />
      </Parts.ItemIndicator>
    </Parts.Item>
  );
  const popup = (
    <Parts.Popup
      className={styles.popup}
      style={theme}
      {...(search ? { initialFocus: searchInput } : {})}
    >
      {search && (
        <div className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <Combobox.Input
            ref={searchInput}
            aria-label={search.ariaLabel}
            placeholder={search.placeholder ?? "Search options"}
            maxLength={100}
          />
        </div>
      )}
      {menuHeader && <div className={styles.menuHeader}>{menuHeader}</div>}
      {menuStatus && <div className={styles.menuStatus}>{menuStatus}</div>}
      <Parts.List ref={setList} className={styles.list} aria-busy={loading}>
        <span
          aria-hidden="true"
          className={styles.highlight}
          style={{
            height: highlight?.height ?? 0,
            transform: `translateY(${highlight?.top ?? 0}px)`,
            opacity: highlight ? 1 : 0,
          }}
        />
        {[...groups].map(([group, entries]) =>
          group ? (
            <Parts.Group key={group}>
              <Parts.GroupLabel className={styles.groupLabel}>
                {group}
              </Parts.GroupLabel>
              {entries.map(renderItem)}
            </Parts.Group>
          ) : (
            entries.map(renderItem)
          ),
        )}
        {options.length === 0 && (
          <div className={styles.empty}>{emptyMessage}</div>
        )}
      </Parts.List>
      {menuFooter && <div className={styles.menuFooter}>{menuFooter}</div>}
    </Parts.Popup>
  );
  const triggerProps = {
    id,
    "aria-label": ariaLabel,
    "data-glide-select": "",
    className: `${styles.trigger} ${className}`,
    "data-size": size,
    style: theme,
  };
  const rootProps = {
    value,
    defaultValue,
    disabled,
    name,
    required,
    open: !disabled && (open ?? internalOpen),
    onOpenChange: handleOpenChange,
    onValueChange: handleValueChange,
  };

  if (search) {
    return (
      <Combobox.Root<Value>
        {...rootProps}
        items={options.map((option) => option.value)}
        itemToStringLabel={(next) =>
          options.find((option) => option.value === next)?.label ?? next
        }
        filter={null}
        inputValue={search.value}
        onInputValueChange={(next, details) => {
          if (
            details.reason === "input-change" ||
            details.reason === "input-clear"
          )
            search.onChange(next);
        }}
      >
        <Combobox.Trigger {...triggerProps}>
          {triggerContent ?? <Combobox.Value />}
          <Combobox.Icon className={styles.chevron}>
            <ChevronDown size={15} aria-hidden="true" />
          </Combobox.Icon>
        </Combobox.Trigger>
        <Combobox.Portal>
          <Combobox.Positioner
            side={placement}
            align={align === "left" ? "start" : "end"}
            sideOffset={6}
            collisionPadding={8}
            className={styles.positioner}
          >
            {popup}
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    );
  }

  return (
    <Select.Root<Value> {...rootProps} items={options}>
      <Select.Trigger {...triggerProps}>
        {triggerContent ?? <Select.Value className={styles.value} />}
        <Select.Icon className={styles.chevron}>
          <ChevronDown size={15} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          side={placement}
          align={align === "left" ? "start" : "end"}
          sideOffset={6}
          collisionPadding={8}
          alignItemWithTrigger={false}
          className={styles.positioner}
        >
          {popup}
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
