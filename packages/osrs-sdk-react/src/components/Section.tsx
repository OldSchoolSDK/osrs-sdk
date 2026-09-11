import React, { FieldsetHTMLAttributes } from "react";

export type SectionProps = Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, "children"> & {
  children?: React.ReactNode;
  title: React.ReactNode;
};

export function Section({ children, style, title, ...props }: SectionProps) {
  return (
    <fieldset
      {...props}
      style={{ border: "1px solid #6b5b3e", margin: "20px 0 0", padding: 12, ...style }}
    >
      <legend style={{ color: "#ff981f", padding: "0 6px" }}>{title}</legend>
      <div style={{ alignItems: "center", display: "grid", gap: "10px 16px", gridTemplateColumns: "minmax(0, 1fr) auto" }}>
        {children}
      </div>
    </fieldset>
  );
}
