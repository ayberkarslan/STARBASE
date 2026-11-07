import { Children, isValidElement, useState, useEffect, type ReactNode } from "react";
import { SelectMenu } from "@stardrop/ui";

/** Form adapter for the shared SelectMenu; no native select is rendered. */
export function FormSelect({
  name,
  children,
  defaultValue,
  value: controlledValue,
  onChange,
  disabled = false,
}: {
  name?: string;
  children: ReactNode;
  defaultValue?: string;
  value?: string;
  onChange?: (e: any) => void;
  disabled?: boolean;
}) {
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((element) => {
      const p = element.props as { value?: string; children: ReactNode };
      return { value: String(p.value ?? p.children), label: String(p.children ?? p.value) };
    });

  const [internalSelected, setInternalSelected] = useState<string>(
    controlledValue ?? defaultValue ?? options[0]?.value ?? "",
  );

  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalSelected(controlledValue);
    }
  }, [controlledValue]);

  const value = controlledValue !== undefined ? controlledValue : internalSelected;

  const handleChange = (val: string) => {
    setInternalSelected(val);
    if (onChange) {
      onChange({ target: { value: val } });
    }
  };

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <SelectMenu
        label={name || "Seçim"}
        value={value}
        options={options}
        onChange={handleChange}
        disabled={disabled || !options.length}
      />
    </>
  );
}
