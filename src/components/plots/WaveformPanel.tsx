import { useEffect, useMemo, useState } from "react";
import { useCircuitStore } from "../../store/useCircuitStore";

const PLOT_WIDTH = 720;
const PLOT_HEIGHT = 200;
const X_DIVISIONS = 10;
const Y_DIVISIONS = 8;
const DB_FLOOR = -240;

function formatNumber(value: number) {
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  if (abs >= 1000 || abs < 1e-2) return value.toExponential(2);
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toDb(value: number) {
  return 20 * Math.log10(Math.max(Math.abs(value), 10 ** (DB_FLOOR / 20)));
}

export function WaveformPanel() {
  const simulationResult = useCircuitStore((s) => s.simulationResult);
  const isSimulating = useCircuitStore((s) => s.isSimulating);
  const [traceName, setTraceName] = useState<string>("");
  const [traceKind, setTraceKind] = useState<"voltage" | "current">("voltage");
  const [scaleMode, setScaleMode] = useState<"linear" | "db">("linear");
  const [xDiv, setXDiv] = useState<number>(1);
  const [yDiv, setYDiv] = useState<number>(1);

  useEffect(() => {
    if (!simulationResult) return;
    if (simulationResult.mode !== "ac" && scaleMode !== "linear") {
      setScaleMode("linear");
    }
    if (traceKind === "voltage") {
      const first = simulationResult.nodeNames.find((name) => name !== "0") ?? simulationResult.nodeNames[0] ?? "0";
      setTraceName(`V(${first})`);
    } else {
      const first = simulationResult.currentNames[0];
      setTraceName(first ? `I(${first})` : "");
    }
  }, [simulationResult, traceKind, scaleMode]);

  const baseTrace = useMemo(() => {
    if (!simulationResult || !traceName) return undefined;
    if (traceKind === "voltage") {
      const key = traceName.replace(/^V\(|\)$/g, "");
      return simulationResult.nodeVoltages[key];
    }
    const key = traceName.replace(/^I\(|\)$/g, "");
    return simulationResult.elementCurrents[key];
  }, [simulationResult, traceKind, traceName]);

  const availableTrace = useMemo(() => {
    if (!baseTrace) return undefined;
    if (simulationResult?.mode === "ac" && scaleMode === "db") {
      return baseTrace.map((value) => toDb(value));
    }
    return baseTrace;
  }, [baseTrace, simulationResult, scaleMode]);

  const xValues = simulationResult?.xValues ?? [];

  useEffect(() => {
    if (!simulationResult || !availableTrace || xValues.length === 0) return;
    const xSpan = Math.max(1e-12, (xValues[xValues.length - 1] ?? 0) - (xValues[0] ?? 0));
    const yMin = Math.min(...availableTrace);
    const yMax = Math.max(...availableTrace);
    const ySpan = Math.max(1e-9, yMax - yMin);

    setXDiv(xSpan / X_DIVISIONS || 1);
    setYDiv(ySpan / Y_DIVISIONS || Math.max(Math.abs(yMax), 1) / Y_DIVISIONS || 1);
  }, [simulationResult, availableTrace, xValues, scaleMode, traceKind]);

  const plotData = useMemo(() => {
    if (!availableTrace || xValues.length === 0) return null;

    const firstX = xValues[0] ?? 0;
    const lastX = xValues[xValues.length - 1] ?? firstX;
    const totalXSpan = Math.max(1e-12, lastX - firstX);
    const effectiveXDiv = Math.max(totalXSpan / X_DIVISIONS, xDiv || totalXSpan / X_DIVISIONS, 1e-12);
    const effectiveYDiv = Math.max(yDiv || 1, 1e-12);
    const yMin = Math.min(...availableTrace);
    const yMax = Math.max(...availableTrace);
    const yCenter = (yMin + yMax) / 2;
    const halfYSpan = (effectiveYDiv * Y_DIVISIONS) / 2;
    const xMin = firstX;
    const xMax = xMin + effectiveXDiv * X_DIVISIONS;
    const yBottom = yCenter - halfYSpan;
    const yTop = yCenter + halfYSpan;

    const points = xValues
      .map((x, index) => ({ x, y: availableTrace[index] ?? 0 }))
      .filter((point) => point.x >= xMin && point.x <= xMax)
      .map((point) => {
        const px = ((point.x - xMin) / Math.max(xMax - xMin, 1e-12)) * PLOT_WIDTH;
        const py = PLOT_HEIGHT - ((point.y - yBottom) / Math.max(yTop - yBottom, 1e-12)) * PLOT_HEIGHT;
        return `${px.toFixed(2)},${clamp(py, -2000, 2000).toFixed(2)}`;
      })
      .join(" ");

    return {
      polylinePoints: points,
      xMin,
      yTop,
      effectiveXDiv,
      effectiveYDiv,
    };
  }, [availableTrace, xValues, xDiv, yDiv]);

  const isAcMode = simulationResult?.mode === "ac";
  const horizontalDivisionLabel = isAcMode ? "Frek./ndarje" : "Koha/ndarje";
  const horizontalUnit = simulationResult?.xUnit ?? "s";
  const verticalLabel = isAcMode && scaleMode === "db" ? "dB/ndarje" : traceKind === "voltage" ? "Volt/ndarje" : "Amper/ndarje";
  const verticalUnit = isAcMode && scaleMode === "db" ? "dB" : traceKind === "voltage" ? "V" : "A";

  return (
    <section className="wave-panel">
      <div className="wave-header">
        <div>
          <h3>Oshiloskopi</h3>
          <div className="toolbar-subtitle">{isSimulating ? "Po ekzekutohet simulimi..." : "Pamja e valëve"}</div>
        </div>
        <div className="trace-controls">
          <button
            type="button"
            className={traceKind === "voltage" ? "toggle active" : "toggle"}
            onClick={() => setTraceKind("voltage")}
          >
            Tensioni
          </button>
          <button
            type="button"
            className={traceKind === "current" ? "toggle active" : "toggle"}
            onClick={() => setTraceKind("current")}
          >
            Rryma
          </button>
          {isAcMode && (
            <button
              type="button"
              className={scaleMode === "db" ? "toggle active" : "toggle"}
              onClick={() => setScaleMode((mode) => (mode === "linear" ? "db" : "linear"))}
            >
              {scaleMode === "db" ? "dB" : "Lineare"}
            </button>
          )}
        </div>
      </div>

      {simulationResult && simulationResult.errors.length > 0 && <div className="sim-error">{simulationResult.rawText}</div>}

      {simulationResult && simulationResult.errors.length === 0 && (
        <>
          <div className="scope-controls-grid">
            <select value={traceName} onChange={(e) => setTraceName(e.target.value)} className="trace-select">
              {traceKind === "voltage"
                ? simulationResult.nodeNames.map((name) => (
                    <option key={name} value={`V(${name})`}>
                      {`V(${name})`}
                    </option>
                  ))
                : simulationResult.currentNames.map((name) => (
                    <option key={name} value={`I(${name})`}>
                      {`I(${name})`}
                    </option>
                  ))}
            </select>
            <label className="scope-field">
              <span>{horizontalDivisionLabel} ({horizontalUnit})</span>
              <input value={xDiv} onChange={(e) => setXDiv(Math.max(1e-12, Number(e.target.value) || xDiv || 1))} />
            </label>
            <label className="scope-field">
              <span>{verticalLabel} ({verticalUnit})</span>
              <input value={yDiv} onChange={(e) => setYDiv(Math.max(1e-12, Number(e.target.value) || yDiv || 1))} />
            </label>
          </div>

          <svg viewBox="0 0 760 260" className="wave-svg">
            <defs>
              <clipPath id="wave-clip">
                <rect x="24" y="16" width={PLOT_WIDTH} height={PLOT_HEIGHT} />
              </clipPath>
            </defs>
            <rect x="24" y="16" width={PLOT_WIDTH} height={PLOT_HEIGHT} className="wave-bg" />
            {Array.from({ length: Y_DIVISIONS + 1 }).map((_, i) => (
              <line
                key={`h-${i}`}
                x1="24"
                x2="744"
                y1={16 + (i * PLOT_HEIGHT) / Y_DIVISIONS}
                y2={16 + (i * PLOT_HEIGHT) / Y_DIVISIONS}
                className="wave-grid"
              />
            ))}
            {Array.from({ length: X_DIVISIONS + 1 }).map((_, i) => (
              <line
                key={`v-${i}`}
                y1="16"
                y2={16 + PLOT_HEIGHT}
                x1={24 + (i * PLOT_WIDTH) / X_DIVISIONS}
                x2={24 + (i * PLOT_WIDTH) / X_DIVISIONS}
                className="wave-grid"
              />
            ))}

            {plotData && (
              <g clipPath="url(#wave-clip)">
                <polyline points={plotData.polylinePoints} transform="translate(24 16)" className="wave-line" />
              </g>
            )}

            {plotData &&
              Array.from({ length: X_DIVISIONS + 1 }).map((_, i) => {
                const xValue = plotData.xMin + i * plotData.effectiveXDiv;
                return (
                  <text key={`xlabel-${i}`} x={24 + (i * PLOT_WIDTH) / X_DIVISIONS} y="232" textAnchor="middle" className="axis-label">
                    {formatNumber(xValue)}
                  </text>
                );
              })}

            {plotData &&
              Array.from({ length: Y_DIVISIONS + 1 }).map((_, i) => {
                const yValue = plotData.yTop - i * plotData.effectiveYDiv;
                return (
                  <text key={`ylabel-${i}`} x="18" y={20 + (i * PLOT_HEIGHT) / Y_DIVISIONS} textAnchor="end" className="axis-label">
                    {formatNumber(yValue)}
                  </text>
                );
              })}
          </svg>

          <div className="wave-meta">
            <span>
              {traceName}
              {isAcMode && scaleMode === "db" ? " · dB" : ""}
            </span>
            <span>
              {simulationResult.mode === "op"
                ? "Pika e punës"
                : ` mostra · `}
            </span>
          </div>
          <pre className="sim-raw">{simulationResult.rawText}</pre>
        </>
      )}

      {!simulationResult && (
        <p className="panel-help">
          Ekzekuto analizën OP, tranziente ose AC sweep për të parë tensionet, rrymat dhe format e valëve.
        </p>
      )}
    </section>
  );
}
