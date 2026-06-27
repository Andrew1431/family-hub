import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type HTMLAttributes,
} from "react";

export type ScrollAxis = "y" | "x" | "both";

export interface ScrollViewProps extends HTMLAttributes<HTMLDivElement> {
  /** Which direction(s) the content scrolls. Default `"y"`. */
  axis?: ScrollAxis;
}

// Tuning constants for the grab-to-scroll gesture.
const DRAG_THRESHOLD = 6; // px of movement before a press becomes a drag (so taps still click)
const FRICTION = 0.94; // velocity retained per ~16ms frame during inertia
const MIN_VELOCITY = 0.02; // px/ms below which inertia stops
const SAMPLE_MS = 1000 / 60; // reference frame length for the inertia integration

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  lastX: number;
  lastY: number;
  lastT: number;
  vx: number; // scroll velocity, px/ms (already in scrollLeft direction)
  vy: number;
  engaged: boolean; // crossed DRAG_THRESHOLD → now hijacking as a drag
}

/**
 * A scroll container with **grab-to-scroll**: press anywhere inside and drag the
 * content to scroll, with momentum on release — the way a touchscreen feels,
 * without having to hit the thin native scrollbar. Built for the wall-mounted
 * touch display where the panel is driven by a finger, not a mouse wheel.
 *
 * Genuine `touch` pointers are left to the browser's native kinetic scrolling
 * (handling them here would double the movement); the JS drag covers `mouse`/
 * `pen` pointers — which is also what a touch overlay that reports as a mouse
 * emits, the case that makes swiping feel broken in the first place.
 *
 * Drop-in for a scrollable `<div>`: pass the same flex/padding classes you'd use
 * on an `overflow-*` element — `axis` adds the overflow + `touch-action` itself.
 */
export const ScrollView = forwardRef<HTMLDivElement, ScrollViewProps>(
  function ScrollView({ axis = "y", className, style, children, ...rest }, ref) {
    const elRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => elRef.current as HTMLDivElement, []);

    const drag = useRef<DragState | null>(null);
    const raf = useRef<number | null>(null);
    // Set when a drag just ended, to swallow the click it would otherwise
    // synthesise on whatever child the finger lifted over.
    const suppressClick = useRef(false);

    const scrollsX = axis === "x" || axis === "both";
    const scrollsY = axis === "y" || axis === "both";

    useEffect(() => {
      const el = elRef.current;
      if (!el) return;

      const stopInertia = () => {
        if (raf.current !== null) {
          cancelAnimationFrame(raf.current);
          raf.current = null;
        }
      };

      const canScroll = (dx: number, dy: number): boolean => {
        // Only engage if the content actually overflows along the gesture's
        // dominant axis — otherwise let the press bubble (e.g. to a parent
        // ScrollView, or a button) untouched.
        const horizontal = Math.abs(dx) > Math.abs(dy);
        if (horizontal && scrollsX) return el.scrollWidth > el.clientWidth;
        if (!horizontal && scrollsY) return el.scrollHeight > el.clientHeight;
        return false;
      };

      const onPointerDown = (e: PointerEvent) => {
        if (e.pointerType === "touch") return; // native kinetic scroll handles touch
        if (e.pointerType === "mouse" && e.button !== 0) return; // left button only
        stopInertia();
        // Kill text selection from the very first move — by the time we cross
        // the drag threshold the browser would already have started selecting.
        // Restored on every exit path below (tap, abort, or drag-end).
        el.style.userSelect = "none";
        drag.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          startLeft: el.scrollLeft,
          startTop: el.scrollTop,
          lastX: e.clientX,
          lastY: e.clientY,
          lastT: e.timeStamp,
          vx: 0,
          vy: 0,
          engaged: false,
        };
      };

      const onPointerMove = (e: PointerEvent) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.pointerId) return;
        // A mouse with no button held means we lost the pointerup — typically a
        // nested ScrollView captured the gesture. Drop the stale pending drag so
        // a later hover-move can't resurrect it as a phantom scroll.
        if (e.pointerType === "mouse" && e.buttons === 0) {
          drag.current = null;
          el.style.userSelect = "";
          return;
        }
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;

        if (!d.engaged) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD || !canScroll(dx, dy)) {
            if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
              drag.current = null; // moved, but not a scroll we own
              el.style.userSelect = "";
            }
            return;
          }
          d.engaged = true;
          el.setPointerCapture(d.pointerId);
          el.style.cursor = "grabbing";
        }

        // We own this gesture now — keep it from reaching an ancestor ScrollView,
        // so the innermost one that can scroll this direction wins (and the outer
        // one never engages/captures over us).
        e.stopPropagation();

        if (scrollsX) el.scrollLeft = d.startLeft - dx;
        if (scrollsY) el.scrollTop = d.startTop - dy;

        const dt = e.timeStamp - d.lastT;
        if (dt > 0) {
          // Scroll moves opposite the finger; store velocity already negated so
          // inertia continues in the same direction the content was travelling.
          d.vx = -(e.clientX - d.lastX) / dt;
          d.vy = -(e.clientY - d.lastY) / dt;
        }
        d.lastX = e.clientX;
        d.lastY = e.clientY;
        d.lastT = e.timeStamp;
      };

      const endDrag = (e: PointerEvent) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.pointerId) return;
        drag.current = null;
        el.style.userSelect = "";
        if (!d.engaged) return; // was a tap; let the click through

        if (el.hasPointerCapture(d.pointerId)) el.releasePointerCapture(d.pointerId);
        el.style.cursor = "";
        suppressClick.current = true;

        // Fling: integrate the release velocity (px/ms) with exponential
        // friction until it dies or the scroll stops moving (hit an edge).
        let vx = d.vx;
        let vy = d.vy;
        let prev = performance.now();
        const step = (now: number) => {
          const elapsed = now - prev;
          prev = now;
          const frames = elapsed / SAMPLE_MS;
          const decay = Math.pow(FRICTION, frames);
          vx *= decay;
          vy *= decay;
          const beforeLeft = el.scrollLeft;
          const beforeTop = el.scrollTop;
          if (scrollsX) el.scrollLeft += vx * elapsed;
          if (scrollsY) el.scrollTop += vy * elapsed;
          const movingX = scrollsX && Math.abs(vx) > MIN_VELOCITY && el.scrollLeft !== beforeLeft;
          const movingY = scrollsY && Math.abs(vy) > MIN_VELOCITY && el.scrollTop !== beforeTop;
          raf.current = movingX || movingY ? requestAnimationFrame(step) : null;
        };
        if (Math.abs(vx) > MIN_VELOCITY || Math.abs(vy) > MIN_VELOCITY) {
          raf.current = requestAnimationFrame(step);
        }
      };

      const onClick = (e: MouseEvent) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        e.stopPropagation();
        e.preventDefault();
      };

      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", endDrag);
      el.addEventListener("pointercancel", endDrag);
      el.addEventListener("click", onClick, true); // capture: beat the child's handler

      return () => {
        stopInertia();
        el.removeEventListener("pointerdown", onPointerDown);
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", endDrag);
        el.removeEventListener("pointercancel", endDrag);
        el.removeEventListener("click", onClick, true);
      };
    }, [scrollsX, scrollsY]);

    const overflow =
      axis === "both"
        ? "overflow-auto"
        : axis === "x"
          ? "overflow-x-auto overflow-y-hidden"
          : "overflow-y-auto overflow-x-hidden";
    const touchAction = axis === "both" ? "pan-x pan-y" : axis === "x" ? "pan-x" : "pan-y";

    return (
      <div
        ref={elRef}
        className={className ? `${overflow} ${className}` : overflow}
        style={{ touchAction, ...style }}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
