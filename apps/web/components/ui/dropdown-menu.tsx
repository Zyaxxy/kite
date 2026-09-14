"use client";

// Adapted from shadcn/ui's MIT dropdown-menu composition, using the Base UI
// primitives already present in Kite. See SHADCN-LICENSE.md and UI-SOURCES.md.
import { Menu } from "@base-ui/react/menu";
import type { ComponentProps } from "react";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export function DropdownMenuContent({
  children,
  className = "",
  align = "end",
  sideOffset = 10,
  ...props
}: Omit<ComponentProps<typeof Menu.Popup>, "className"> & {
  className?: string;
  align?: ComponentProps<typeof Menu.Positioner>["align"];
  sideOffset?: number;
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        align={align}
        sideOffset={sideOffset}
        className="kite-menu-positioner"
      >
        <Menu.Popup className={`kite-menu ${className}`} {...props}>
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className = "",
  ...props
}: ComponentProps<typeof Menu.Item>) {
  return <Menu.Item className={`kite-menu-item ${className}`} {...props} />;
}

export function DropdownMenuLinkItem({
  className = "",
  ...props
}: ComponentProps<typeof Menu.LinkItem>) {
  return (
    <Menu.LinkItem
      closeOnClick
      className={`kite-menu-item ${className}`}
      {...props}
    />
  );
}

export function DropdownMenuSeparator(
  props: ComponentProps<typeof Menu.Separator>,
) {
  return <Menu.Separator className="kite-menu-separator" {...props} />;
}
