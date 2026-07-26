import type { HTMLAttributes, ReactElement, ReactNode } from "react";

export function ComposerFrame({
  controls,
  children,
  toolbar,
  className = "",
  ...attributes
}: HTMLAttributes<HTMLDivElement> & {
  controls: ReactNode;
  toolbar: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <div {...attributes} className={`topic-composer${className ? ` ${className}` : ""}`}>
      {controls}
      {children}
      <div className="composer-toolbar">{toolbar}</div>
    </div>
  );
}
