import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent } from "react";
import type { CircuitComponent, Pin, Point } from "../../circuit/models/types";
import { useCircuitStore } from "../../store/useCircuitStore";

const GRID_SIZE = 20;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.12;

function snap(value: number, grid = GRID_SIZE) {
  return Math.round(value / grid) * grid;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rotatePoint(point: Point, rotation: CircuitComponent["rotation"]): Point {
  switch (rotation) {
    case 0:
      return point;
    case 90:
      return { x: -point.y, y: point.x };
    case 180:
      return { x: -point.x, y: -point.y };
    case 270:
      return { x: point.y, y: -point.x };
  }
}

function pinPosition(component: CircuitComponent, pin: Pin) {
  const rotated = rotatePoint(pin.offset, component.rotation);
  return {
    x: component.position.x + rotated.x,
    y: component.position.y + rotated.y,
  };
}

function componentBody(component: CircuitComponent) {
  switch (component.type) {
    case "ground":
      return (
        <>
          <line x1={0} y1={-22} x2={0} y2={-6} className="symbol-line" />
          <line x1={-16} y1={-6} x2={16} y2={-6} className="symbol-line" />
          <line x1={-10} y1={0} x2={10} y2={0} className="symbol-line" />
          <line x1={-5} y1={6} x2={5} y2={6} className="symbol-line" />
        </>
      );
    case "vsource":
      return (
        <>
          <line x1={0} y1={-34} x2={0} y2={-18} className="symbol-line" />
          <line x1={0} y1={18} x2={0} y2={34} className="symbol-line" />
          <circle cx={0} cy={0} r={18} className="symbol-outline" />
          <line x1={0} y1={-8} x2={0} y2={8} className="symbol-line" />
          <line x1={-6} y1={0} x2={6} y2={0} className="symbol-line" />
          <line x1={-6} y1={12} x2={6} y2={12} className="symbol-line" />
        </>
      );
    case "acsource":
      return (
        <>
          <line x1={0} y1={-34} x2={0} y2={-18} className="symbol-line" />
          <line x1={0} y1={18} x2={0} y2={34} className="symbol-line" />
          <circle cx={0} cy={0} r={18} className="symbol-outline" />
          <path d="M -10 3 C -6 -9 -2 -9 2 3 S 10 15 10 3" className="symbol-line" />
        </>
      );
    case "resistor":
      return (
        <>
          <line x1={-44} y1={0} x2={-28} y2={0} className="symbol-line" />
          <polyline
            points="-28,0 -20,-10 -12,10 -4,-10 4,10 12,-10 20,10 28,0"
            className="symbol-line"
          />
          <line x1={28} y1={0} x2={44} y2={0} className="symbol-line" />
        </>
      );
    case "capacitor":
      return (
        <>
          <line x1={-38} y1={0} x2={-12} y2={0} className="symbol-line" />
          <line x1={-12} y1={-16} x2={-12} y2={16} className="symbol-line" />
          <line x1={12} y1={-16} x2={12} y2={16} className="symbol-line" />
          <line x1={12} y1={0} x2={38} y2={0} className="symbol-line" />
        </>
      );
    case "inductor":
      return (
        <>
          <line x1={-42} y1={0} x2={-28} y2={0} className="symbol-line" />
          <path d="M -28 0 C -28 -10 -18 -10 -18 0 C -18 -10 -8 -10 -8 0 C -8 -10 2 -10 2 0 C 2 -10 12 -10 12 0 C 12 -10 22 -10 22 0" className="symbol-line" />
          <line x1={22} y1={0} x2={42} y2={0} className="symbol-line" />
        </>
      );
    case "diode":
      return (
        <>
          <line x1={-38} y1={0} x2={-16} y2={0} className="symbol-line" />
          <polygon points="-16,-16 -16,16 8,0" className="symbol-fill" />
          <line x1={12} y1={-16} x2={12} y2={16} className="symbol-line" />
          <line x1={12} y1={0} x2={38} y2={0} className="symbol-line" />
        </>
      );
    case "opamp":
      return (
        <>
          <line x1={-44} y1={-18} x2={-24} y2={-18} className="symbol-line" />
          <line x1={-44} y1={18} x2={-24} y2={18} className="symbol-line" />
          <line x1={24} y1={0} x2={48} y2={0} className="symbol-line" />
          <polygon points="-24,-30 -24,30 24,0" className="symbol-outline" />
          <text x={-14} y={-12} className="component-label small-label">+</text>
          <text x={-14} y={22} className="component-label small-label">−</text>
        </>
      );
  }
}

interface DragState {
  componentId: string;
  offsetX: number;
  offsetY: number;
}

interface CameraState {
  x: number;
  y: number;
  scale: number;
}

interface PanState {
  pointerX: number;
  pointerY: number;
  cameraX: number;
  cameraY: number;
}

function getSvgViewportPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const scaleX = viewBox.width / rect.width;
  const scaleY = viewBox.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX + viewBox.x,
    y: (clientY - rect.top) * scaleY + viewBox.y,
  };
}

function getScenePoint(svg: SVGSVGElement, clientX: number, clientY: number, camera: CameraState) {
  const viewportPoint = getSvgViewportPoint(svg, clientX, clientY);
  return {
    x: (viewportPoint.x - camera.x) / camera.scale,
    y: (viewportPoint.y - camera.y) / camera.scale,
  };
}

function ComponentShape({
  component,
  pins,
  zoom,
  onStartDrag,
}: {
  component: CircuitComponent;
  pins: Pin[];
  zoom: number;
  onStartDrag: (componentId: string, e: ReactMouseEvent<SVGGElement>) => void;
}) {
  const selectedComponentId = useCircuitStore((s) => s.selectedComponentId);
  const pendingWirePinId = useCircuitStore((s) => s.pendingWirePinId);
  const selectComponent = useCircuitStore((s) => s.selectComponent);
  const beginWire = useCircuitStore((s) => s.beginWire);
  const addWire = useCircuitStore((s) => s.addWire);

  const isSelected = component.id === selectedComponentId;
  const pinRadius = Math.max(4.5, 6 / zoom);

  return (
    <g
      transform={`translate(${component.position.x}, ${component.position.y}) rotate(${component.rotation})`}
      style={{ cursor: isSelected ? "grab" : "default" }}
      onMouseDown={(e) => {
        e.stopPropagation();
        selectComponent(component.id);
        onStartDrag(component.id, e);
      }}
    >
      <rect
        x={-56}
        y={-42}
        width={112}
        height={84}
        rx={12}
        className={isSelected ? "component-hitbox selected" : "component-hitbox"}
      />
      {componentBody(component)}
      <text x={0} y={52} textAnchor="middle" className="component-label">
        {component.label}
      </text>
      {pins.map((pin) => (
        <circle
          key={pin.id}
          cx={pin.offset.x}
          cy={pin.offset.y}
          r={pinRadius}
          className={pendingWirePinId === pin.id ? "pin-dot active" : "pin-dot"}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (!pendingWirePinId) {
              beginWire(pin.id);
              return;
            }
            addWire(pendingWirePinId, pin.id);
          }}
        />
      ))}
    </g>
  );
}

export function SchematicCanvas() {
  const document = useCircuitStore((s) => s.document);
  const selectComponent = useCircuitStore((s) => s.selectComponent);
  const clearPendingWire = useCircuitStore((s) => s.clearPendingWire);
  const rotateSelected = useCircuitStore((s) => s.rotateSelected);
  const deleteSelected = useCircuitStore((s) => s.deleteSelected);
  const moveComponent = useCircuitStore((s) => s.moveComponent);

  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const cameraRef = useRef<CameraState>({ x: 0, y: 0, scale: 1 });
  const componentMapRef = useRef(new Map(document.components.map((component) => [component.id, component])));

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, scale: 1 });

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    componentMapRef.current = new Map(document.components.map((component) => [component.id, component]));
  }, [document.components]);

  const updateZoom = useCallback((nextScale: number, centerClientX?: number, centerClientY?: number) => {
    const svg = svgRef.current;
    if (!svg) return;

    const previous = cameraRef.current;
    const scale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(scale - previous.scale) < 1e-6) return;

    const rect = svg.getBoundingClientRect();
    const clientX = centerClientX ?? rect.left + rect.width / 2;
    const clientY = centerClientY ?? rect.top + rect.height / 2;

    const viewportPoint = getSvgViewportPoint(svg, clientX, clientY);
    const sceneX = (viewportPoint.x - previous.x) / previous.scale;
    const sceneY = (viewportPoint.y - previous.y) / previous.scale;

    setCamera({
      x: viewportPoint.x - sceneX * scale,
      y: viewportPoint.y - sceneY * scale,
      scale,
    });
  }, []);

  const stopDragging = useCallback(
    (shouldSnap: boolean) => {
      const drag = draggingRef.current;
      if (!drag) return;
      if (shouldSnap) {
        const component = componentMapRef.current.get(drag.componentId);
        if (component) {
          moveComponent(drag.componentId, snap(component.position.x), snap(component.position.y));
        }
      }
      draggingRef.current = null;
      setDraggingId(null);
    },
    [moveComponent],
  );

  const stopPanning = useCallback(() => {
    panRef.current = null;
    setIsPanning(false);
  }, []);

  useEffect(() => {
    const onWindowMouseMove = (event: MouseEvent) => {
      const drag = draggingRef.current;
      const svg = svgRef.current;
      if (drag && svg) {
        const point = getScenePoint(svg, event.clientX, event.clientY, cameraRef.current);
        moveComponent(drag.componentId, point.x - drag.offsetX, point.y - drag.offsetY);
        return;
      }

      const pan = panRef.current;
      if (pan && svg) {
        const rect = svg.getBoundingClientRect();
        const viewBox = svg.viewBox.baseVal;
        const scaleX = viewBox.width / rect.width;
        const scaleY = viewBox.height / rect.height;
        setCamera((current) => ({
          ...current,
          x: pan.cameraX + (event.clientX - pan.pointerX) * scaleX,
          y: pan.cameraY + (event.clientY - pan.pointerY) * scaleY,
        }));
      }
    };

    const onWindowMouseUp = () => {
      stopDragging(true);
      stopPanning();
    };

    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, [moveComponent, stopDragging, stopPanning]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      if (isEditing) return;

      if (event.key.toLowerCase() === "r") {
        rotateSelected();
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelected();
      }
      if (event.key === "Escape") {
        clearPendingWire();
        stopDragging(false);
        stopPanning();
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        updateZoom(cameraRef.current.scale * ZOOM_STEP);
      }
      if (event.key === "-") {
        event.preventDefault();
        updateZoom(cameraRef.current.scale / ZOOM_STEP);
      }
      if (event.key === "0") {
        event.preventDefault();
        setCamera({ x: 0, y: 0, scale: 1 });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rotateSelected, deleteSelected, clearPendingWire, stopDragging, stopPanning, updateZoom]);

  const handleStartDrag = useCallback((componentId: string, event: ReactMouseEvent<SVGGElement>) => {
    const svg = svgRef.current;
    const component = componentMapRef.current.get(componentId);
    if (!svg || !component) return;

    const point = getScenePoint(svg, event.clientX, event.clientY, cameraRef.current);
    draggingRef.current = {
      componentId,
      offsetX: point.x - component.position.x,
      offsetY: point.y - component.position.y,
    };
    setDraggingId(componentId);
  }, []);

  const handleCanvasMouseDown = useCallback((event: ReactMouseEvent<SVGSVGElement>) => {
    if (event.button === 1 || event.shiftKey) {
      const svg = svgRef.current;
      if (!svg) return;
      panRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        cameraX: cameraRef.current.x,
        cameraY: cameraRef.current.y,
      };
      setIsPanning(true);
      return;
    }

    if (event.button !== 0) return;
    selectComponent(null);
    clearPendingWire();
  }, [selectComponent, clearPendingWire]);

  const handleWheel = useCallback((event: ReactWheelEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    event.preventDefault();

    if (event.ctrlKey || !event.shiftKey) {
      const direction = event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      updateZoom(cameraRef.current.scale * direction, event.clientX, event.clientY);
      return;
    }

    setCamera((current) => ({
      ...current,
      x: current.x - event.deltaX,
      y: current.y - event.deltaY,
    }));
  }, [updateZoom]);

  const pinMap = useMemo(() => new Map(document.pins.map((pin) => [pin.id, pin])), [document.pins]);
  const componentMap = useMemo(
    () => new Map(document.components.map((component) => [component.id, component])),
    [document.components],
  );

  const componentPins = (componentId: string) => document.pins.filter((p) => p.componentId === componentId);
  const gridPatternSize = GRID_SIZE * camera.scale;

  return (
    <div className="canvas-shell">
      <div className="canvas-overlay-controls">
        <button type="button" onClick={() => updateZoom(camera.scale * ZOOM_STEP)}>+</button>
        <button type="button" onClick={() => updateZoom(camera.scale / ZOOM_STEP)}>−</button>
        <button type="button" onClick={() => setCamera({ x: 0, y: 0, scale: 1 })}>100%</button>
        <span>{Math.round(camera.scale * 100)}%</span>
      </div>

      <svg
        ref={svgRef}
        className={`schematic-canvas${draggingId ? " dragging-canvas" : ""}${isPanning ? " panning-canvas" : ""}`}
        viewBox="0 0 1200 800"
        onMouseDown={handleCanvasMouseDown}
        onWheel={handleWheel}
      >
        <defs>
          <pattern
            id="smallGrid"
            width={gridPatternSize}
            height={gridPatternSize}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${camera.x} ${camera.y})`}
          >
            <path d={`M ${gridPatternSize} 0 L 0 0 0 ${gridPatternSize}`} fill="none" className="grid-line" />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#smallGrid)" />

        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
          {document.wires.map((wire) => {
            const fromPin = pinMap.get(wire.fromPinId);
            const toPin = pinMap.get(wire.toPinId);
            if (!fromPin || !toPin) return null;

            const fromComponent = componentMap.get(fromPin.componentId);
            const toComponent = componentMap.get(toPin.componentId);
            if (!fromComponent || !toComponent) return null;

            const a = pinPosition(fromComponent, fromPin);
            const b = pinPosition(toComponent, toPin);
            const midX = snap((a.x + b.x) / 2);

            return (
              <polyline
                key={wire.id}
                points={`${a.x},${a.y} ${midX},${a.y} ${midX},${b.y} ${b.x},${b.y}`}
                className="wire-line"
              />
            );
          })}

          {document.components.map((component) => (
            <ComponentShape
              key={component.id}
              component={component}
              pins={componentPins(component.id)}
              zoom={camera.scale}
              onStartDrag={handleStartDrag}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
