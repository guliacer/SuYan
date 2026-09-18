import { useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes } from "react";

type MarqueeTextProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  text: string;
};

/** Keeps long single-line labels readable without changing the control width. */
export function MarqueeText({ text, className = "", title = text, ...props }: MarqueeTextProps) {
  const viewportRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLSpanElement | null>(null);
  const [distance, setDistance] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track) {
        return;
      }

      setDistance(Math.max(0, Math.ceil(track.scrollWidth - viewport.clientWidth)));
    };

    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (observer && viewportRef.current && trackRef.current) {
      observer.observe(viewportRef.current);
      observer.observe(trackRef.current);
    }
    window.addEventListener("resize", measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [text]);

  const style = {
    "--model-name-marquee-distance": `${distance}px`,
    "--model-name-marquee-duration": `${Math.min(12, Math.max(5, 5 + distance / 100))}s`,
  } as CSSProperties;

  return (
    <span
      {...props}
      aria-label={props["aria-label"] ?? text}
      className={`model-name-marquee min-w-0 overflow-hidden ${className}`}
      data-overflowing={distance > 0 ? "true" : "false"}
      ref={viewportRef}
      style={{ ...style, ...props.style }}
      title={title}
    >
      <span className="model-name-marquee__track" ref={trackRef}>
        {text}
      </span>
    </span>
  );
}
