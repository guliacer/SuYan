import { createPortal } from "react-dom";
import { useEffect } from "react";
import { windowResizeEdges } from "../../types/windowResize";

export function WindowResizeHandles() {
  useEffect(() => {
    const stop = () => { void window.suyanApi.resizeWindow(null); };
    window.addEventListener("blur", stop);
    return () => { window.removeEventListener("blur", stop); stop(); };
  }, []);
  return createPortal(<div className="window-resize-handles" aria-hidden="true">
    {windowResizeEdges.map((edge) => <div key={edge} data-resize-edge={edge}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        void window.suyanApi.resizeWindow(edge, { x: event.clientX, y: event.clientY });
      }}
      onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); }}
      onLostPointerCapture={() => { void window.suyanApi.resizeWindow(null); }}
      onPointerCancel={() => { void window.suyanApi.resizeWindow(null); }} />)}
  </div>, document.body);
}
