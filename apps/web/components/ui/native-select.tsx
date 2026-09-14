import * as React from "react";
import { ChevronDown } from "lucide-react";

// Adapted from shadcn/ui Native Select (MIT). See SHADCN-LICENSE.md.
// https://ui.shadcn.com/docs/components/native-select
export function NativeSelect({
  className = "",
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div data-slot="native-select-wrapper" className="ui-native-select-wrapper">
      <select
        data-slot="native-select"
        className={`ui-native-select ${className}`}
        {...props}
      />
      <ChevronDown aria-hidden="true" size={14} />
    </div>
  );
}
export function NativeSelectOption(props: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" {...props} />;
}
