import { Children, isValidElement, useState, type ReactNode } from "react";
import { SelectMenu } from "@stardrop/ui";
/** Form adapter for the shared SelectMenu; no native select is rendered. */
export function FormSelect({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((element) => {
      const p = element.props as { value?: string; children: ReactNode };
      return { value: String(p.value ?? p.children), label: p.children };
    });
  const [selected, setSelected] = useState<string | null>(null);
  const value = options.some((o) => o.value === selected)
    ? selected!
    : (options[0]?.value ?? "");
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <SelectMenu
        label={name}
        value={value}
        options={options}
        onChange={setSelected}
        disabled={!options.length}
      />
    </>
  );
}
