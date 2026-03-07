import { create } from "zustand";
import { createComponent } from "../circuit/models/factory";
import { runSimulation } from "../circuit/simulation/engine";
import type {
  CircuitDocument,
  ComponentType,
  Rotation,
  SimulationOptions,
  SimulationResult,
  Wire,
} from "../circuit/models/types";

interface CircuitState {
  document: CircuitDocument;
  selectedComponentId: string | null;
  pendingWirePinId: string | null;
  simulationOptions: SimulationOptions;
  simulationResult: SimulationResult | null;
  isSimulating: boolean;
  addComponent: (type: ComponentType) => void;
  moveComponent: (id: string, x: number, y: number) => void;
  updateComponentProperties: (id: string, patch: Record<string, string | number | boolean>) => void;
  updateSimulationOptions: (patch: Partial<SimulationOptions>) => void;
  selectComponent: (id: string | null) => void;
  rotateSelected: () => void;
  deleteSelected: () => void;
  beginWire: (pinId: string) => void;
  addWire: (fromPinId: string, toPinId: string) => void;
  clearPendingWire: () => void;
  runSimulation: (mode?: "op" | "tran" | "ac") => Promise<void>;
}

function nextRotation(rotation: Rotation): Rotation {
  const order: Rotation[] = [0, 90, 180, 270];
  return order[(order.indexOf(rotation) + 1) % order.length];
}

export const useCircuitStore = create<CircuitState>((set, get) => ({
  document: {
    components: [],
    pins: [],
    wires: [],
  },
  selectedComponentId: null,
  pendingWirePinId: null,
  simulationOptions: {
    mode: "tran",
    timeStep: 1e-3,
    stopTime: 10e-3,
    acStartFrequency: 10,
    acStopFrequency: 100000,
    acPoints: 120,
    acSpacing: "log",
  },
  simulationResult: null,
  isSimulating: false,

  addComponent: (type) =>
    set((state) => {
      const count = state.document.components.filter((c) => c.type === type).length + 1;
      const { component, pins } = createComponent(
        type,
        180 + state.document.components.length * 28,
        180 + state.document.components.length * 22,
      );
      if (component.type !== "ground") {
        const prefixMap: Record<ComponentType, string> = {
          ground: "GND",
          vsource: "V",
          acsource: "VAC",
          resistor: "R",
          capacitor: "C",
          inductor: "L",
          diode: "D",
          opamp: "U",
        };
        component.label = `${prefixMap[type]}${count}`;
      }

      return {
        document: {
          ...state.document,
          components: [...state.document.components, component],
          pins: [...state.document.pins, ...pins],
        },
        selectedComponentId: component.id,
      };
    }),

  moveComponent: (id, x, y) =>
    set((state) => ({
      document: {
        ...state.document,
        components: state.document.components.map((c) =>
          c.id === id ? { ...c, position: { x, y } } : c,
        ),
      },
    })),

  updateComponentProperties: (id, patch) =>
    set((state) => ({
      document: {
        ...state.document,
        components: state.document.components.map((c) =>
          c.id === id ? { ...c, properties: { ...c.properties, ...patch } } : c,
        ),
      },
    })),

  updateSimulationOptions: (patch) =>
    set((state) => ({
      simulationOptions: {
        ...state.simulationOptions,
        ...patch,
      },
    })),

  selectComponent: (id) => set({ selectedComponentId: id }),

  rotateSelected: () =>
    set((state) => ({
      document: {
        ...state.document,
        components: state.document.components.map((c) =>
          c.id === state.selectedComponentId ? { ...c, rotation: nextRotation(c.rotation) } : c,
        ),
      },
    })),

  deleteSelected: () =>
    set((state) => {
      const selectedComponentId = state.selectedComponentId;
      if (!selectedComponentId) return state;

      const removedPinIds = new Set(
        state.document.pins.filter((pin) => pin.componentId === selectedComponentId).map((pin) => pin.id),
      );

      const pendingWirePinId =
        state.pendingWirePinId && removedPinIds.has(state.pendingWirePinId)
          ? null
          : state.pendingWirePinId;

      return {
        document: {
          components: state.document.components.filter((component) => component.id !== selectedComponentId),
          pins: state.document.pins.filter((pin) => pin.componentId !== selectedComponentId),
          wires: state.document.wires.filter(
            (wire) => !removedPinIds.has(wire.fromPinId) && !removedPinIds.has(wire.toPinId),
          ),
        },
        selectedComponentId: null,
        pendingWirePinId,
      };
    }),

  beginWire: (pinId) => set({ pendingWirePinId: pinId }),

  addWire: (fromPinId, toPinId) => {
    if (fromPinId === toPinId) {
      set({ pendingWirePinId: null });
      return;
    }

    const { document } = get();
    const exists = document.wires.some(
      (wire) =>
        (wire.fromPinId === fromPinId && wire.toPinId === toPinId) ||
        (wire.fromPinId === toPinId && wire.toPinId === fromPinId),
    );

    if (exists) {
      set({ pendingWirePinId: null });
      return;
    }

    set((state) => {
      const wire: Wire = {
        id: crypto.randomUUID(),
        fromPinId,
        toPinId,
      };

      return {
        document: {
          ...state.document,
          wires: [...state.document.wires, wire],
        },
        pendingWirePinId: null,
      };
    });
  },

  clearPendingWire: () => set({ pendingWirePinId: null }),

  runSimulation: async (mode) => {
    set({ isSimulating: true });
    const { document, simulationOptions } = get();
    const result = await runSimulation(document, {
      ...simulationOptions,
      mode: mode ?? simulationOptions.mode,
    });
    set({ simulationResult: result, isSimulating: false });
  },
}));
