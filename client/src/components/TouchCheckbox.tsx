import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

type ForwardedCheckboxProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | "required"
  | "checked"
  | "onChange"
  | "aria-invalid"
  | "aria-describedby"
  | "disabled"
>;

export interface TouchCheckboxProps extends ForwardedCheckboxProps {
  id: string;
  children: ReactNode;
  labelClassName?: string;
  labelTestId?: string;
  "data-testid"?: string;
}

const TouchCheckbox = forwardRef<HTMLInputElement, TouchCheckboxProps>(
  (
    {
      id,
      children,
      labelClassName = "",
      labelTestId,
      ...inputProps
    },
    ref,
  ) => (
    <label
      htmlFor={id}
      className={`flex min-h-11 min-w-11 items-center gap-3 ${labelClassName}`.trim()}
      data-testid={labelTestId}
    >
      <input
        {...inputProps}
        ref={ref}
        id={id}
        type="checkbox"
        className="h-4 w-4 shrink-0 accent-[var(--pulse)]"
      />
      {children}
    </label>
  ),
);

TouchCheckbox.displayName = "TouchCheckbox";

export default TouchCheckbox;
