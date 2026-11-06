import { useState, type ComponentProps } from "react";
import { TextField } from "@stardrop/ui";
import { Eye, EyeOff } from "lucide-react";

export function PasswordField(props: Omit<ComponentProps<typeof TextField>, "type">) {
  const [visible, setVisible] = useState(false);
  return <div className="password-field">
    <TextField {...props} type={visible ? "text" : "password"} />
    <button type="button" className="password-field__toggle" aria-label={visible ? "Şifreyi gizle" : "Şifreyi göster"} aria-pressed={visible} onClick={() => setVisible(!visible)}>
      {visible ? <EyeOff size={17} /> : <Eye size={17} />}
    </button>
  </div>;
}
