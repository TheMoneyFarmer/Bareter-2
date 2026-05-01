import {
  Children,
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { useReveal } from "@/hooks/use-reveal";

interface StaggeredRevealProps {
  children: ReactNode;
  className?: string;
  stagger?: number;
  testId?: string;
}

interface StaggerableProps {
  className?: string;
  style?: CSSProperties;
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
    const typed = child as ReactElement<StaggerableProps>;
    const existingClass = typed.props.className ?? "";
    const existingStyle = typed.props.style ?? {};
    return cloneElement(typed, {
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
