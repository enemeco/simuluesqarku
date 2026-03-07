import type { CircuitDocument } from "../models/types";

function buildNodeMap(document: CircuitDocument): Map<string, string> {
  const parent = new Map<string, string>();

  for (const pin of document.pins) {
    parent.set(pin.id, pin.id);
  }

  const find = (x: string): string => {
    const p = parent.get(x);
    if (!p || p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };

  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const wire of document.wires) {
    union(wire.fromPinId, wire.toPinId);
  }

  for (const component of document.components) {
    if (component.type === "ground") {
      parent.set(find(component.pinIds[0]), "0-root");
    }
  }

  const rootToNode = new Map<string, string>();
  let counter = 1;

  for (const pin of document.pins) {
    const root = find(pin.id);
    if (root === "0-root") {
      rootToNode.set(root, "0");
      continue;
    }
    if (!rootToNode.has(root)) {
      rootToNode.set(root, `N${counter++}`);
    }
  }

  const pinToNode = new Map<string, string>();
  for (const pin of document.pins) {
    pinToNode.set(pin.id, rootToNode.get(find(pin.id)) ?? "0");
  }

  return pinToNode;
}

export function generateNetlist(document: CircuitDocument): string {
  const pinToNode = buildNodeMap(document);
  const lines: string[] = ["* Eksport nga Simuluesi i Qarqeve"];
  let hasDefaultDiode = false;

  for (const component of document.components) {
    const nodes = component.pinIds.map((id) => pinToNode.get(id) ?? "0");

    switch (component.type) {
      case "ground":
        break;
      case "vsource":
        lines.push(`${component.label} ${nodes[0]} ${nodes[1]} DC ${component.properties.dc ?? 5}`);
        break;
      case "acsource": {
        const offset = component.properties.offset ?? 0;
        const amplitude = component.properties.amplitude ?? 5;
        const frequency = component.properties.frequency ?? 1000;
        const phase = component.properties.phase ?? 0;
        lines.push(`${component.label} ${nodes[0]} ${nodes[1]} SIN(${offset} ${amplitude} ${frequency} 0 0 ${phase})`);
        break;
      }
      case "resistor":
        lines.push(`${component.label} ${nodes[0]} ${nodes[1]} ${component.properties.resistance ?? 1000}`);
        break;
      case "capacitor":
        lines.push(`${component.label} ${nodes[0]} ${nodes[1]} ${component.properties.capacitance ?? 1e-6}`);
        break;
      case "inductor":
        lines.push(`${component.label} ${nodes[0]} ${nodes[1]} ${component.properties.inductance ?? 1e-3}`);
        break;
      case "diode": {
        const model = String(component.properties.model ?? "DDEFAULT");
        if (model === "DDEFAULT") hasDefaultDiode = true;
        lines.push(`${component.label} ${nodes[0]} ${nodes[1]} ${model}`);
        break;
      }
      case "opamp":
        lines.push(`E_${component.label} ${nodes[2]} 0 ${nodes[0]} ${nodes[1]} ${component.properties.gain ?? 100000}`);
        break;
    }
  }

  if (hasDefaultDiode) {
    lines.push(`.model DDEFAULT D`);
  }
  lines.push(`.op`);
  lines.push(`.end`);

  return lines.join("\n");
}
