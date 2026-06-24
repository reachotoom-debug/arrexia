"use client";

import * as React from "react";

interface HorizontalScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  viewportClassName?: string;
}

export function HorizontalScrollArea({
  children,
  className = "",
  viewportClassName = "",
}: HorizontalScrollAreaProps) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = React.useState(false);
  const [showRight, setShowRight] = React.useState(false);

  const updateFades = React.useCallback(() => {
    const node = viewportRef.current;
    if (!node) return;

    const { scrollLeft, scrollWidth, clientWidth } = node;
    const hasOverflow = scrollWidth > clientWidth + 1;

    if (!hasOverflow) {
      setShowLeft(false);
      setShowRight(false);
      return;
    }

    setShowLeft(scrollLeft > 2);
    setShowRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  React.useEffect(() => {
    updateFades();
    const node = viewportRef.current;
    if (!node) return;

    const resizeObserver = new ResizeObserver(updateFades);
    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, [updateFades]);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={viewportRef}
        onScroll={updateFades}
        className={`overflow-x-auto scrollbar-thin scrollbar-transparent ${viewportClassName}`}
      >
        {children}
      </div>
      {showLeft ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent" />
      ) : null}
      {showRight ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent" />
      ) : null}
    </div>
  );
}
