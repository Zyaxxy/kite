"use client";

// Adapted from shadcn/ui Table (MIT). See SHADCN-LICENSE.md.
// https://ui.shadcn.com/docs/components/table
// Kite supplies its existing forest/lime styling instead of adding a second theme.
import * as React from "react";

export function Table({
  className = "",
  ...props
}: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="ui-table-container">
      <table data-slot="table" className={`ui-table ${className}`} {...props} />
    </div>
  );
}
export function TableHeader(props: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" {...props} />;
}
export function TableBody(props: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" {...props} />;
}
export function TableRow(props: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" {...props} />;
}
export function TableHead(props: React.ComponentProps<"th">) {
  return <th data-slot="table-head" {...props} />;
}
export function TableCell(props: React.ComponentProps<"td">) {
  return <td data-slot="table-cell" {...props} />;
}
export function TableCaption(props: React.ComponentProps<"caption">) {
  return <caption data-slot="table-caption" {...props} />;
}
