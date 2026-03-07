import type { ComponentType } from "../../circuit/models/types";
import { useCircuitStore } from "../../store/useCircuitStore";

const items: { type: ComponentType; label: string }[] = [
  { type: "ground", label: "Tokë" },
  { type: "vsource", label: "Burim tensioni DC" },
  { type: "acsource", label: "Burim tensioni AC" },
  { type: "resistor", label: "Rezistor" },
  { type: "capacitor", label: "Kondensator" },
  { type: "inductor", label: "Induktor" },
  { type: "diode", label: "Diodë" },
  { type: "opamp", label: "Op-Amp" },
];

export function Palette() {
  const addComponent = useCircuitStore((s) => s.addComponent);

  return (
    <div>
      <h3>Komponentët</h3>
      <div className="palette-list">
        {items.map((item) => (
          <button key={item.type} onClick={() => addComponent(item.type)}>
            {item.label}
          </button>
        ))}
      </div>
      <p className="panel-help">Kliko dy pine për të krijuar një tel mes tyre.</p>
    </div>
  );
}
