export type ComponentType =
  | "ground"
  | "vsource"
  | "acsource"
  | "resistor"
  | "capacitor"
  | "inductor"
  | "diode"
  | "opamp";

export type Rotation = 0 | 90 | 180 | 270;

export interface Point {
  x: number;
  y: number;
}

export interface Pin {
  id: string;
  componentId: string;
  name: string;
  offset: Point;
}

export interface CircuitComponent {
  id: string;
  type: ComponentType;
  label: string;
  position: Point;
  rotation: Rotation;
  properties: Record<string, string | number | boolean>;
  pinIds: string[];
}

export interface Wire {
  id: string;
  fromPinId: string;
  toPinId: string;
}

export interface CircuitDocument {
  components: CircuitComponent[];
  pins: Pin[];
  wires: Wire[];
}

export interface SimulationOptions {
  mode: "op" | "tran" | "ac";
  timeStep: number;
  stopTime: number;
  acStartFrequency: number;
  acStopFrequency: number;
  acPoints: number;
  acSpacing: "log" | "linear";
}

export interface SimulationResult {
  mode: "op" | "tran" | "ac";
  xValues: number[];
  xLabel: string;
  xUnit: string;
  nodeVoltages: Record<string, number[]>;
  elementCurrents: Record<string, number[]>;
  nodeNames: string[];
  currentNames: string[];
  rawText: string;
  errors: string[];
}
