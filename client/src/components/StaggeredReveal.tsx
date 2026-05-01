import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { useReveal } from "@/hooks/use-reveal";

interface StaggeredRevealProps {
  children: ReactNode;
  className?: string;
  stagger?: number;
  testId?: string;
}

export function StaggeredReveal({
  children,
  className,
  stagger = 60,
  testId,
}: StaggeredRevealProps) {
  const { ref, isVisible } = useReveal<HTMLDivElement>();

  const enhanced = Children.map(children, (child, i) => {
    if (!isValidElement(child)) return child;
    const existingClass = (child.props as any).className ?? "";
    const existingStyle = (child.props as any).style ?? {};
    return cloneElement(child as React.ReactElement<any>, {
      className: `${existingClass} bareter-stagger-card`.trim(),
      style: { ...existingStyle, transitionDelay: `${i * stagger}ms` },
    });
  });

  return (
    <div
      ref={ref}
      className={`${className ?? ""} ${isVisible ? "is-in-view" : ""}`.trim()}
      data-testid={testId}
    >
      {enhanced}
    </div>
  );
}

export default StaggeredReveal;
