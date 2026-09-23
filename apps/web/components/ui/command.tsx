"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

// Adapted from shadcn/ui Command (MIT). See SHADCN-LICENSE.md.
// https://ui.shadcn.com/docs/components/command
// Styled with Kite's existing forest/lime tokens and tabular numerals.

interface CommandContextValue {
  search: string;
  setSearch: (value: string) => void;
  activeIndex: number;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  itemCount: number;
  setItemCount: React.Dispatch<React.SetStateAction<number>>;
}

const CommandContext = React.createContext<CommandContextValue | null>(null);

export function useCommand() {
  const ctx = React.useContext(CommandContext);
  if (!ctx) {
    throw new Error("useCommand must be used within a Command component");
  }
  return ctx;
}

export interface CommandProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
}

export function Command({
  className = "",
  children,
  value,
  onValueChange,
  ...props
}: CommandProps) {
  const [internalSearch, setInternalSearch] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [itemCount, setItemCount] = React.useState(0);

  const search = value !== undefined ? value : internalSearch;
  const setSearch = React.useCallback(
    (next: string) => {
      if (onValueChange) {
        onValueChange(next);
      } else {
        setInternalSearch(next);
      }
      setActiveIndex(0);
    },
    [onValueChange]
  );

  return (
    <CommandContext.Provider
      value={{
        search,
        setSearch,
        activeIndex,
        setActiveIndex,
        itemCount,
        setItemCount,
      }}
    >
      <div
        data-slot="command"
        className={`ui-command ${className}`}
        {...props}
      >
        {children}
      </div>
    </CommandContext.Provider>
  );
}

export interface CommandInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value?: string;
  onValueChange?: (value: string) => void;
  shortcut?: string;
  onClear?: () => void;
}

export const CommandInput = React.forwardRef<HTMLInputElement, CommandInputProps>(
  function CommandInput(
    { className = "", shortcut, placeholder = "Search equities…", onClear, disabled, ...props },
    forwardedRef
  ) {
    const { search, setSearch } = useCommand();
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    const handleClear = () => {
      setSearch("");
      if (onClear) onClear();
      inputRef.current?.focus();
    };

    return (
      <div data-slot="command-input-wrapper" className="ui-command-input-wrapper">
        <Search size={15} className="ui-command-search-icon" aria-hidden="true" />
        <input
          ref={(node) => {
            inputRef.current = node;
            if (typeof forwardedRef === "function") forwardedRef(node);
            else if (forwardedRef) forwardedRef.current = node;
          }}
          data-slot="command-input"
          type="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={search}
          disabled={disabled}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className={`ui-command-input ${className}`}
          {...props}
        />
        {search && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="ui-command-clear-btn"
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
        {shortcut && !search && (
          <kbd className="ui-command-shortcut" aria-hidden="true">
            {shortcut}
          </kbd>
        )}
      </div>
    );
  }
);

export function CommandList({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="command-list"
      role="listbox"
      className={`ui-command-list ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CommandEmpty({
  className = "",
  children = "No results found.",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="command-empty"
      className={`ui-command-empty ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CommandGroup({
  className = "",
  heading,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { heading?: React.ReactNode }) {
  return (
    <div
      data-slot="command-group"
      className={`ui-command-group ${className}`}
      {...props}
    >
      {heading && (
        <div data-slot="command-group-heading" className="ui-command-group-heading">
          {heading}
        </div>
      )}
      <div className="ui-command-group-items">{children}</div>
    </div>
  );
}

export interface CommandItemProps extends React.HTMLAttributes<HTMLDivElement> {
  disabled?: boolean;
  onSelect?: () => void;
  selected?: boolean;
}

export function CommandItem({
  className = "",
  disabled = false,
  onSelect,
  selected = false,
  children,
  ...props
}: CommandItemProps) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (onSelect) onSelect();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (onSelect) onSelect();
    }
  };

  return (
    <div
      data-slot="command-item"
      role="option"
      aria-selected={selected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`ui-command-item ${selected ? "selected" : ""} ${
        disabled ? "disabled" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CommandSeparator({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="command-separator"
      className={`ui-command-separator ${className}`}
      {...props}
    />
  );
}
