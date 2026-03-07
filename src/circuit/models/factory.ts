import type { CircuitComponent, ComponentType, Pin } from "./types";

const uid = () => crypto.randomUUID();

export function createComponent(type: ComponentType, x = 200, y = 200): {
  component: CircuitComponent;
  pins: Pin[];
} {
  const componentId = uid();

  switch (type) {
    case "ground": {
      const pinId = uid();
      return {
        component: {
          id: componentId,
          type,
          label: "GND",
          position: { x, y },
          rotation: 0,
          properties: {},
          pinIds: [pinId],
        },
        pins: [
          {
            id: pinId,
            componentId,
            name: "gnd",
            offset: { x: 0, y: -22 },
          },
        ],
      };
    }

    case "vsource": {
      const p = uid();
      const n = uid();
      return {
        component: {
          id: componentId,
          type,
          label: "V1",
          position: { x, y },
          rotation: 0,
          properties: { dc: 5 },
          pinIds: [p, n],
        },
        pins: [
          { id: p, componentId, name: "plus", offset: { x: 0, y: -34 } },
          { id: n, componentId, name: "minus", offset: { x: 0, y: 34 } },
        ],
      };
    }

    case "acsource": {
      const p = uid();
      const n = uid();
      return {
        component: {
          id: componentId,
          type,
          label: "VAC1",
          position: { x, y },
          rotation: 0,
          properties: {
            offset: 0,
            amplitude: 5,
            frequency: 1000,
            phase: 0,
          },
          pinIds: [p, n],
        },
        pins: [
          { id: p, componentId, name: "plus", offset: { x: 0, y: -34 } },
          { id: n, componentId, name: "minus", offset: { x: 0, y: 34 } },
        ],
      };
    }

    case "resistor": {
      const a = uid();
      const b = uid();
      return {
        component: {
          id: componentId,
          type,
          label: "R1",
          position: { x, y },
          rotation: 0,
          properties: { resistance: 1000 },
          pinIds: [a, b],
        },
        pins: [
          { id: a, componentId, name: "a", offset: { x: -44, y: 0 } },
          { id: b, componentId, name: "b", offset: { x: 44, y: 0 } },
        ],
      };
    }

    case "capacitor": {
      const a = uid();
      const b = uid();
      return {
        component: {
          id: componentId,
          type,
          label: "C1",
          position: { x, y },
          rotation: 0,
          properties: { capacitance: 1e-6 },
          pinIds: [a, b],
        },
        pins: [
          { id: a, componentId, name: "a", offset: { x: -38, y: 0 } },
          { id: b, componentId, name: "b", offset: { x: 38, y: 0 } },
        ],
      };
    }

    case "inductor": {
      const a = uid();
      const b = uid();
      return {
        component: {
          id: componentId,
          type,
          label: "L1",
          position: { x, y },
          rotation: 0,
          properties: { inductance: 1e-3 },
          pinIds: [a, b],
        },
        pins: [
          { id: a, componentId, name: "a", offset: { x: -42, y: 0 } },
          { id: b, componentId, name: "b", offset: { x: 42, y: 0 } },
        ],
      };
    }

    case "diode": {
      const anode = uid();
      const cathode = uid();
      return {
        component: {
          id: componentId,
          type,
          label: "D1",
          position: { x, y },
          rotation: 0,
          properties: { model: "DDEFAULT" },
          pinIds: [anode, cathode],
        },
        pins: [
          { id: anode, componentId, name: "anode", offset: { x: -38, y: 0 } },
          { id: cathode, componentId, name: "cathode", offset: { x: 38, y: 0 } },
        ],
      };
    }

    case "opamp": {
      const vp = uid();
      const vn = uid();
      const out = uid();
      return {
        component: {
          id: componentId,
          type,
          label: "U1",
          position: { x, y },
          rotation: 0,
          properties: { gain: 100000 },
          pinIds: [vp, vn, out],
        },
        pins: [
          { id: vp, componentId, name: "plus", offset: { x: -44, y: -18 } },
          { id: vn, componentId, name: "minus", offset: { x: -44, y: 18 } },
          { id: out, componentId, name: "out", offset: { x: 48, y: 0 } },
        ],
      };
    }
  }
}
