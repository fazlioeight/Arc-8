import { useEffect, useState } from "react";

/**
 * Observes size changes for a DOM element.
 * Returns { width, height } with throttled updates via requestAnimationFrame.
 */
export default function useResizeObserver(targetRef) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = targetRef?.current;
    if (!element) return undefined;

    let frame = null;
    const updateSize = (entry) => {
      const box = entry?.contentRect || element.getBoundingClientRect();
      const next = { width: Math.round(box.width), height: Math.round(box.height) };
      frame = window.requestAnimationFrame(() => {
        setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
      });
    };

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        updateSize(entries[0]);
      });
      observer.observe(element);
      updateSize();
      return () => {
        observer.disconnect();
        if (frame) window.cancelAnimationFrame(frame);
      };
    }

    const onResize = () => updateSize();
    window.addEventListener("resize", onResize);
    updateSize();
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [targetRef]);

  return size;
}

