import { useCircuitStore } from "../../store/useCircuitStore";

const componentTypeLabels: Record<string, string> = {
  ground: "Tokë",
  vsource: "Burim tensioni DC",
  acsource: "Burim tensioni AC",
  resistor: "Rezistor",
  capacitor: "Kondensator",
  inductor: "Induktor",
  diode: "Diodë",
  opamp: "Op-Amp",
};

const propertyLabels: Record<string, string> = {
  dc: "Tensioni DC",
  offset: "Offset",
  amplitude: "Amplituda",
  frequency: "Frekuenca",
  phase: "Faza",
  resistance: "Rezistenca",
  capacitance: "Kapaciteti",
  inductance: "Induktanca",
  model: "Modeli",
  gain: "Fitimi",
};

export function InspectorPanel() {
  const selectedComponentId = useCircuitStore((s) => s.selectedComponentId);
  const document = useCircuitStore((s) => s.document);
  const simulationOptions = useCircuitStore((s) => s.simulationOptions);
  const updateComponentProperties = useCircuitStore((s) => s.updateComponentProperties);
  const updateSimulationOptions = useCircuitStore((s) => s.updateSimulationOptions);

  const component = document.components.find((c) => c.id === selectedComponentId);

  return (
    <div className="inspector-root">
      <div>
        <h3>Simulimi</h3>
        <div className="inspector-fields">
          <label className="field-row">
            <span>Hapi kohor (s)</span>
            <input
              value={simulationOptions.timeStep}
              onChange={(e) =>
                updateSimulationOptions({ timeStep: Math.max(1e-6, Number(e.target.value) || 1e-3) })
              }
            />
          </label>
          <label className="field-row">
            <span>Koha e ndalimit (s)</span>
            <input
              value={simulationOptions.stopTime}
              onChange={(e) =>
                updateSimulationOptions({ stopTime: Math.max(1e-6, Number(e.target.value) || 10e-3) })
              }
            />
          </label>
          <label className="field-row">
            <span>Frekuenca fillestare AC (Hz)</span>
            <input
              value={simulationOptions.acStartFrequency}
              onChange={(e) =>
                updateSimulationOptions({
                  acStartFrequency: Math.max(1e-6, Number(e.target.value) || 10),
                })
              }
            />
          </label>
          <label className="field-row">
            <span>Frekuenca përfundimtare AC (Hz)</span>
            <input
              value={simulationOptions.acStopFrequency}
              onChange={(e) =>
                updateSimulationOptions({
                  acStopFrequency: Math.max(1e-6, Number(e.target.value) || 100000),
                })
              }
            />
          </label>
          <label className="field-row">
            <span>Pikat e sweep-it AC</span>
            <input
              value={simulationOptions.acPoints}
              onChange={(e) =>
                updateSimulationOptions({ acPoints: Math.max(2, Math.floor(Number(e.target.value) || 120)) })
              }
            />
          </label>
          <label className="field-row">
            <span>Shtrirja AC</span>
            <select
              value={simulationOptions.acSpacing}
              onChange={(e) =>
                updateSimulationOptions({ acSpacing: e.target.value === "linear" ? "linear" : "log" })
              }
            >
              <option value="log">Logaritmike</option>
              <option value="linear">Lineare</option>
            </select>
          </label>
        </div>
      </div>

      <div className="inspector-divider" />

      {!component ? (
        <div>
          <h3>Inspektori</h3>
          <p>Zgjidh një komponent për t’i ndryshuar vlerat.</p>
        </div>
      ) : (
        <div>
          <h3>Inspektori</h3>
          <p>
            <strong>{component.label}</strong> ({componentTypeLabels[component.type] ?? component.type})
          </p>
          <div className="inspector-fields">
            <label className="field-row">
              <span>Rrotullimi</span>
              <input value={`${component.rotation}°`} readOnly />
            </label>
            {Object.entries(component.properties).length === 0 && <p>Nuk ka veti të modifikueshme.</p>}
            {Object.entries(component.properties).map(([key, value]) => (
              <label key={key} className="field-row">
                <span>{propertyLabels[key] ?? key}</span>
                <input
                  value={String(value)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const parsed = Number(raw);
                    updateComponentProperties(component.id, {
                      [key]: Number.isNaN(parsed) ? raw : parsed,
                    });
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
