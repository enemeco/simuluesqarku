import type {
  CircuitComponent,
  CircuitDocument,
  SimulationOptions,
  SimulationResult,
} from "../models/types";

type Matrix = number[][];

interface Complex {
  re: number;
  im: number;
}

interface PreparedCircuit {
  nodeMap: Map<string, string>;
  orderedNodes: string[];
  nodeIndex: Map<string, number>;
}

interface SimulationState {
  nodeVoltages: Record<string, number>;
  elementCurrents: Record<string, number>;
}

const DEFAULT_OPTIONS: SimulationOptions = {
  mode: "tran",
  timeStep: 1e-3,
  stopTime: 10e-3,
  acStartFrequency: 10,
  acStopFrequency: 100000,
  acPoints: 120,
  acSpacing: "log",
};

const DIODE_IS = 1e-12;
const DIODE_NVT = 0.02585;
const MAX_DIODE_EXP = 40;

function complex(re = 0, im = 0): Complex {
  return { re, im };
}

function cAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

function cSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

function cMul(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

function cDiv(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  if (denom < 1e-30) throw new Error("Matrica e sweep-it AC është singulare.");
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
}

function cAbs(a: Complex): number {
  return Math.hypot(a.re, a.im);
}

function cFromPolar(magnitude: number, phaseRadians = 0): Complex {
  return {
    re: magnitude * Math.cos(phaseRadians),
    im: magnitude * Math.sin(phaseRadians),
  };
}

function cloneMatrix(size: number): Matrix {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function cloneVector(size: number): number[] {
  return Array(size).fill(0);
}

function cloneComplexMatrix(size: number): Complex[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => complex()));
}

function cloneComplexVector(size: number): Complex[] {
  return Array.from({ length: size }, () => complex());
}

function addConductance(matrix: Matrix, n1: number | null, n2: number | null, g: number) {
  if (n1 !== null) matrix[n1][n1] += g;
  if (n2 !== null) matrix[n2][n2] += g;
  if (n1 !== null && n2 !== null) {
    matrix[n1][n2] -= g;
    matrix[n2][n1] -= g;
  }
}

function addCurrent(rhs: number[], n1: number | null, n2: number | null, current: number) {
  if (n1 !== null) rhs[n1] -= current;
  if (n2 !== null) rhs[n2] += current;
}

function addComplexConductance(matrix: Complex[][], n1: number | null, n2: number | null, y: Complex) {
  if (n1 !== null) matrix[n1][n1] = cAdd(matrix[n1][n1], y);
  if (n2 !== null) matrix[n2][n2] = cAdd(matrix[n2][n2], y);
  if (n1 !== null && n2 !== null) {
    matrix[n1][n2] = cSub(matrix[n1][n2], y);
    matrix[n2][n1] = cSub(matrix[n2][n1], y);
  }
}

function stampVoltageSource(
  matrix: Matrix,
  rhs: number[],
  nPlus: number | null,
  nMinus: number | null,
  branchIndex: number,
  value: number,
) {
  if (nPlus !== null) {
    matrix[nPlus][branchIndex] += 1;
    matrix[branchIndex][nPlus] += 1;
  }
  if (nMinus !== null) {
    matrix[nMinus][branchIndex] -= 1;
    matrix[branchIndex][nMinus] -= 1;
  }
  rhs[branchIndex] += value;
}

function stampComplexVoltageSource(
  matrix: Complex[][],
  rhs: Complex[],
  nPlus: number | null,
  nMinus: number | null,
  branchIndex: number,
  value: Complex,
) {
  const one = complex(1, 0);
  const minusOne = complex(-1, 0);
  if (nPlus !== null) {
    matrix[nPlus][branchIndex] = cAdd(matrix[nPlus][branchIndex], one);
    matrix[branchIndex][nPlus] = cAdd(matrix[branchIndex][nPlus], one);
  }
  if (nMinus !== null) {
    matrix[nMinus][branchIndex] = cAdd(matrix[nMinus][branchIndex], minusOne);
    matrix[branchIndex][nMinus] = cAdd(matrix[branchIndex][nMinus], minusOne);
  }
  rhs[branchIndex] = cAdd(rhs[branchIndex], value);
}

function stampInductorTransient(
  matrix: Matrix,
  rhs: number[],
  n1: number | null,
  n2: number | null,
  branchIndex: number,
  inductance: number,
  dt: number,
  previousCurrent: number,
) {
  if (n1 !== null) {
    matrix[n1][branchIndex] += 1;
    matrix[branchIndex][n1] += 1;
  }
  if (n2 !== null) {
    matrix[n2][branchIndex] -= 1;
    matrix[branchIndex][n2] -= 1;
  }
  const alpha = inductance / dt;
  matrix[branchIndex][branchIndex] -= alpha;
  rhs[branchIndex] -= alpha * previousCurrent;
}

function stampComplexInductor(
  matrix: Complex[][],
  rhs: Complex[],
  n1: number | null,
  n2: number | null,
  branchIndex: number,
  omega: number,
  inductance: number,
) {
  const one = complex(1, 0);
  const minusOne = complex(-1, 0);
  if (n1 !== null) {
    matrix[n1][branchIndex] = cAdd(matrix[n1][branchIndex], one);
    matrix[branchIndex][n1] = cAdd(matrix[branchIndex][n1], one);
  }
  if (n2 !== null) {
    matrix[n2][branchIndex] = cAdd(matrix[n2][branchIndex], minusOne);
    matrix[branchIndex][n2] = cAdd(matrix[branchIndex][n2], minusOne);
  }
  matrix[branchIndex][branchIndex] = cSub(matrix[branchIndex][branchIndex], complex(0, omega * inductance));
  rhs[branchIndex] = cAdd(rhs[branchIndex], complex(0, 0));
}

function solveLinearSystem(matrix: Matrix, rhs: number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row) => [...row]);
  const b = [...rhs];

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }

    if (Math.abs(a[pivot][col]) < 1e-14) {
      throw new Error("Matrica e qarkut është singulare. Shto një tokë dhe sigurohu që çdo nyje të jetë e lidhur.");
    }

    if (pivot !== col) {
      [a[pivot], a[col]] = [a[col], a[pivot]];
      [b[pivot], b[col]] = [b[col], b[pivot]];
    }

    const pivotValue = a[col][col];
    for (let j = col; j < n; j += 1) a[col][j] /= pivotValue;
    b[col] /= pivotValue;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      if (Math.abs(factor) < 1e-16) continue;
      for (let j = col; j < n; j += 1) a[row][j] -= factor * a[col][j];
      b[row] -= factor * b[col];
    }
  }

  return b;
}

function solveComplexLinearSystem(matrix: Complex[][], rhs: Complex[]): Complex[] {
  const n = rhs.length;
  const a = matrix.map((row) => row.map((cell) => complex(cell.re, cell.im)));
  const b = rhs.map((value) => complex(value.re, value.im));

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (cAbs(a[row][col]) > cAbs(a[pivot][col])) pivot = row;
    }

    if (cAbs(a[pivot][col]) < 1e-14) {
      throw new Error("Matrica e sweep-it AC është singulare. Sigurohu që qarku të jetë i lidhur dhe i tokëzuar.");
    }

    if (pivot !== col) {
      [a[pivot], a[col]] = [a[col], a[pivot]];
      [b[pivot], b[col]] = [b[col], b[pivot]];
    }

    const pivotValue = a[col][col];
    for (let j = col; j < n; j += 1) a[col][j] = cDiv(a[col][j], pivotValue);
    b[col] = cDiv(b[col], pivotValue);

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      if (cAbs(factor) < 1e-16) continue;
      for (let j = col; j < n; j += 1) a[row][j] = cSub(a[row][j], cMul(factor, a[col][j]));
      b[row] = cSub(b[row], cMul(factor, b[col]));
    }
  }

  return b;
}

function buildNodeMap(document: CircuitDocument): Map<string, string> {
  const parent = new Map<string, string>();
  for (const pin of document.pins) parent.set(pin.id, pin.id);

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

  for (const wire of document.wires) union(wire.fromPinId, wire.toPinId);
  for (const component of document.components) {
    if (component.type === "ground") parent.set(find(component.pinIds[0]), "0-root");
  }

  const rootToNode = new Map<string, string>();
  let counter = 1;
  for (const pin of document.pins) {
    const root = find(pin.id);
    if (root === "0-root") rootToNode.set(root, "0");
    else if (!rootToNode.has(root)) rootToNode.set(root, `N${counter++}`);
  }

  const pinToNode = new Map<string, string>();
  for (const pin of document.pins) pinToNode.set(pin.id, rootToNode.get(find(pin.id)) ?? "0");
  return pinToNode;
}

function prepareCircuit(document: CircuitDocument): PreparedCircuit {
  const nodeMap = buildNodeMap(document);
  const orderedNodes = Array.from(new Set(nodeMap.values())).filter((name) => name !== "0").sort();
  const nodeIndex = new Map(orderedNodes.map((node, index) => [node, index]));
  return { nodeMap, orderedNodes, nodeIndex };
}

function countBranchComponents(document: CircuitDocument): number {
  return document.components.filter((component) =>
    component.type === "vsource" ||
    component.type === "acsource" ||
    component.type === "opamp" ||
    component.type === "inductor",
  ).length;
}

function getNodeIndex(prepared: PreparedCircuit, nodeName: string): number | null {
  if (nodeName === "0") return null;
  return prepared.nodeIndex.get(nodeName) ?? null;
}

function sourceValueAt(component: CircuitComponent, time: number): number {
  if (component.type === "vsource") return Number(component.properties.dc ?? 5);
  if (component.type === "acsource") {
    const offset = Number(component.properties.offset ?? 0);
    const amplitude = Number(component.properties.amplitude ?? 5);
    const frequency = Math.max(0, Number(component.properties.frequency ?? 1000));
    const phaseDegrees = Number(component.properties.phase ?? 0);
    const phaseRadians = (phaseDegrees * Math.PI) / 180;
    return offset + amplitude * Math.sin(2 * Math.PI * frequency * time + phaseRadians);
  }
  return 0;
}

function acSourcePhasor(component: CircuitComponent): Complex {
  if (component.type !== "acsource") return complex(0, 0);
  const amplitude = Number(component.properties.amplitude ?? 5);
  const phaseDegrees = Number(component.properties.phase ?? 0);
  return cFromPolar(amplitude, (phaseDegrees * Math.PI) / 180);
}

function diodeLinearization(vd: number): { gd: number; current: number } {
  const limited = Math.max(-100, Math.min(MAX_DIODE_EXP * DIODE_NVT, vd));
  const expTerm = Math.exp(limited / DIODE_NVT);
  const id = DIODE_IS * (expTerm - 1);
  const gd = Math.max(1e-12, (DIODE_IS / DIODE_NVT) * expTerm);
  return { gd, current: id };
}

function stampLinearDevices(
  document: CircuitDocument,
  prepared: PreparedCircuit,
  matrix: Matrix,
  rhs: number[],
  time: number,
  previousState?: SimulationState,
  dt?: number,
) {
  let branchOffset = prepared.orderedNodes.length;

  for (const component of document.components) {
    const nodes = component.pinIds.map((pinId) => prepared.nodeMap.get(pinId) ?? "0");
    const n1 = getNodeIndex(prepared, nodes[0]);
    const n2 = getNodeIndex(prepared, nodes[1]);

    switch (component.type) {
      case "resistor": {
        const resistance = Math.max(1e-9, Number(component.properties.resistance ?? 1000));
        addConductance(matrix, n1, n2, 1 / resistance);
        break;
      }
      case "capacitor": {
        if (dt && previousState) {
          const c = Math.max(1e-15, Number(component.properties.capacitance ?? 1e-6));
          const g = c / dt;
          addConductance(matrix, n1, n2, g);
          const vp = (previousState.nodeVoltages[nodes[0]] ?? 0) - (previousState.nodeVoltages[nodes[1]] ?? 0);
          addCurrent(rhs, n1, n2, g * vp);
        }
        break;
      }
      case "inductor": {
        const branchIndex = branchOffset;
        branchOffset += 1;
        const inductance = Math.max(1e-12, Number(component.properties.inductance ?? 1e-3));
        if (dt && previousState) {
          const previousCurrent = previousState.elementCurrents[component.label] ?? 0;
          stampInductorTransient(matrix, rhs, n1, n2, branchIndex, inductance, dt, previousCurrent);
        } else {
          stampVoltageSource(matrix, rhs, n1, n2, branchIndex, 0);
        }
        break;
      }
      case "vsource":
      case "acsource": {
        const branchIndex = branchOffset;
        branchOffset += 1;
        stampVoltageSource(matrix, rhs, n1, n2, branchIndex, sourceValueAt(component, time));
        break;
      }
      case "opamp": {
        const plusNode = getNodeIndex(prepared, nodes[0]);
        const minusNode = getNodeIndex(prepared, nodes[1]);
        const outNode = getNodeIndex(prepared, nodes[2]);
        const gain = Number(component.properties.gain ?? 100000);
        const branchIndex = branchOffset;
        branchOffset += 1;
        if (outNode !== null) {
          matrix[outNode][branchIndex] += 1;
          matrix[branchIndex][outNode] += 1;
        }
        if (plusNode !== null) matrix[branchIndex][plusNode] -= gain;
        if (minusNode !== null) matrix[branchIndex][minusNode] += gain;
        break;
      }
      case "ground":
      case "diode":
        break;
    }
  }
}

function stampDiodes(
  document: CircuitDocument,
  prepared: PreparedCircuit,
  matrix: Matrix,
  rhs: number[],
  guessNodeVoltages: Record<string, number>,
) {
  for (const component of document.components) {
    if (component.type !== "diode") continue;
    const [anodeName, cathodeName] = component.pinIds.map((pinId) => prepared.nodeMap.get(pinId) ?? "0");
    const anode = getNodeIndex(prepared, anodeName);
    const cathode = getNodeIndex(prepared, cathodeName);
    const vd = (guessNodeVoltages[anodeName] ?? 0) - (guessNodeVoltages[cathodeName] ?? 0);
    const { gd, current } = diodeLinearization(vd);
    const ieq = current - gd * vd;
    addConductance(matrix, anode, cathode, gd);
    addCurrent(rhs, anode, cathode, ieq);
  }
}

function stampAcDevices(
  document: CircuitDocument,
  prepared: PreparedCircuit,
  matrix: Complex[][],
  rhs: Complex[],
  omega: number,
  biasNodeVoltages: Record<string, number>,
) {
  let branchOffset = prepared.orderedNodes.length;

  for (const component of document.components) {
    const nodes = component.pinIds.map((pinId) => prepared.nodeMap.get(pinId) ?? "0");
    const n1 = getNodeIndex(prepared, nodes[0]);
    const n2 = getNodeIndex(prepared, nodes[1]);

    switch (component.type) {
      case "resistor": {
        const resistance = Math.max(1e-9, Number(component.properties.resistance ?? 1000));
        addComplexConductance(matrix, n1, n2, complex(1 / resistance, 0));
        break;
      }
      case "capacitor": {
        const c = Math.max(1e-15, Number(component.properties.capacitance ?? 1e-6));
        addComplexConductance(matrix, n1, n2, complex(0, omega * c));
        break;
      }
      case "inductor": {
        const branchIndex = branchOffset;
        branchOffset += 1;
        const inductance = Math.max(1e-12, Number(component.properties.inductance ?? 1e-3));
        stampComplexInductor(matrix, rhs, n1, n2, branchIndex, omega, inductance);
        break;
      }
      case "diode": {
        const vd = (biasNodeVoltages[nodes[0]] ?? 0) - (biasNodeVoltages[nodes[1]] ?? 0);
        const { gd } = diodeLinearization(vd);
        addComplexConductance(matrix, n1, n2, complex(gd, 0));
        break;
      }
      case "vsource": {
        const branchIndex = branchOffset;
        branchOffset += 1;
        stampComplexVoltageSource(matrix, rhs, n1, n2, branchIndex, complex(0, 0));
        break;
      }
      case "acsource": {
        const branchIndex = branchOffset;
        branchOffset += 1;
        stampComplexVoltageSource(matrix, rhs, n1, n2, branchIndex, acSourcePhasor(component));
        break;
      }
      case "opamp": {
        const plusNode = getNodeIndex(prepared, nodes[0]);
        const minusNode = getNodeIndex(prepared, nodes[1]);
        const outNode = getNodeIndex(prepared, nodes[2]);
        const gain = Number(component.properties.gain ?? 100000);
        const branchIndex = branchOffset;
        branchOffset += 1;
        if (outNode !== null) {
          matrix[outNode][branchIndex] = cAdd(matrix[outNode][branchIndex], complex(1, 0));
          matrix[branchIndex][outNode] = cAdd(matrix[branchIndex][outNode], complex(1, 0));
        }
        if (plusNode !== null) matrix[branchIndex][plusNode] = cAdd(matrix[branchIndex][plusNode], complex(-gain, 0));
        if (minusNode !== null) matrix[branchIndex][minusNode] = cAdd(matrix[branchIndex][minusNode], complex(gain, 0));
        break;
      }
      case "ground":
        break;
    }
  }
}

function extractSolution(document: CircuitDocument, prepared: PreparedCircuit, solution: number[]): SimulationState {
  const nodeVoltages: Record<string, number> = { 0: 0 };
  for (const nodeName of prepared.orderedNodes) {
    nodeVoltages[nodeName] = solution[prepared.nodeIndex.get(nodeName)!] ?? 0;
  }

  const elementCurrents: Record<string, number> = {};
  let branchOffset = prepared.orderedNodes.length;

  for (const component of document.components) {
    switch (component.type) {
      case "vsource":
      case "acsource":
      case "opamp":
      case "inductor":
        elementCurrents[component.label] = solution[branchOffset] ?? 0;
        branchOffset += 1;
        break;
      case "resistor": {
        const [n1, n2] = component.pinIds.map((pinId) => prepared.nodeMap.get(pinId) ?? "0");
        const r = Math.max(1e-9, Number(component.properties.resistance ?? 1000));
        elementCurrents[component.label] = ((nodeVoltages[n1] ?? 0) - (nodeVoltages[n2] ?? 0)) / r;
        break;
      }
      case "capacitor":
        elementCurrents[component.label] = 0;
        break;
      case "diode": {
        const [a, c] = component.pinIds.map((pinId) => prepared.nodeMap.get(pinId) ?? "0");
        const vd = (nodeVoltages[a] ?? 0) - (nodeVoltages[c] ?? 0);
        elementCurrents[component.label] = diodeLinearization(vd).current;
        break;
      }
      case "ground":
        break;
    }
  }

  return { nodeVoltages, elementCurrents };
}

function computeCapacitorCurrents(
  document: CircuitDocument,
  prepared: PreparedCircuit,
  currentState: SimulationState,
  previousState: SimulationState,
  dt: number,
) {
  for (const component of document.components) {
    if (component.type !== "capacitor") continue;
    const [n1, n2] = component.pinIds.map((pinId) => prepared.nodeMap.get(pinId) ?? "0");
    const c = Math.max(1e-15, Number(component.properties.capacitance ?? 1e-6));
    const vNow = (currentState.nodeVoltages[n1] ?? 0) - (currentState.nodeVoltages[n2] ?? 0);
    const vPrev = (previousState.nodeVoltages[n1] ?? 0) - (previousState.nodeVoltages[n2] ?? 0);
    currentState.elementCurrents[component.label] = c * (vNow - vPrev) / dt;
  }
}

function solveNonlinearStep(
  document: CircuitDocument,
  prepared: PreparedCircuit,
  time: number,
  previousState?: SimulationState,
  dt?: number,
): SimulationState {
  const size = prepared.orderedNodes.length + countBranchComponents(document);
  const guess: Record<string, number> = { 0: 0 };
  for (const node of prepared.orderedNodes) guess[node] = previousState?.nodeVoltages[node] ?? 0;

  for (let iter = 0; iter < 60; iter += 1) {
    const matrix = cloneMatrix(size);
    const rhs = cloneVector(size);
    stampLinearDevices(document, prepared, matrix, rhs, time, previousState, dt);
    stampDiodes(document, prepared, matrix, rhs, guess);

    const solution = solveLinearSystem(matrix, rhs);
    const state = extractSolution(document, prepared, solution);

    let maxDelta = 0;
    for (const node of prepared.orderedNodes) {
      maxDelta = Math.max(maxDelta, Math.abs((state.nodeVoltages[node] ?? 0) - (guess[node] ?? 0)));
      guess[node] = state.nodeVoltages[node] ?? 0;
    }

    if (maxDelta < 1e-7) return state;
  }

  throw new Error("Zgjidhja jolineare nuk konvergoi. Uli vlerat e burimeve ose thjeshto qarkun.");
}

function solveAcFrekuenca(
  document: CircuitDocument,
  prepared: PreparedCircuit,
  frequency: number,
  biasState: SimulationState,
): SimulationState {
  const size = prepared.orderedNodes.length + countBranchComponents(document);
  const matrix = cloneComplexMatrix(size);
  const rhs = cloneComplexVector(size);
  const omega = 2 * Math.PI * frequency;

  stampAcDevices(document, prepared, matrix, rhs, omega, biasState.nodeVoltages);
  const solution = solveComplexLinearSystem(matrix, rhs);

  const nodeVoltages: Record<string, number> = { 0: 0 };
  for (const nodeName of prepared.orderedNodes) {
    nodeVoltages[nodeName] = cAbs(solution[prepared.nodeIndex.get(nodeName)!] ?? complex());
  }

  const elementCurrents: Record<string, number> = {};
  let branchOffset = prepared.orderedNodes.length;

  for (const component of document.components) {
    switch (component.type) {
      case "vsource":
      case "acsource":
      case "opamp":
      case "inductor":
        elementCurrents[component.label] = cAbs(solution[branchOffset] ?? complex());
        branchOffset += 1;
        break;
      case "resistor": {
        const [n1Name, n2Name] = component.pinIds.map((pinId) => prepared.nodeMap.get(pinId) ?? "0");
        const n1 = n1Name === "0" ? complex() : solution[prepared.nodeIndex.get(n1Name)!] ?? complex();
        const n2 = n2Name === "0" ? complex() : solution[prepared.nodeIndex.get(n2Name)!] ?? complex();
        const r = Math.max(1e-9, Number(component.properties.resistance ?? 1000));
        elementCurrents[component.label] = cAbs(cDiv(cSub(n1, n2), complex(r, 0)));
        break;
      }
      case "capacitor": {
        const [n1Name, n2Name] = component.pinIds.map((pinId) => prepared.nodeMap.get(pinId) ?? "0");
        const n1 = n1Name === "0" ? complex() : solution[prepared.nodeIndex.get(n1Name)!] ?? complex();
        const n2 = n2Name === "0" ? complex() : solution[prepared.nodeIndex.get(n2Name)!] ?? complex();
        const c = Math.max(1e-15, Number(component.properties.capacitance ?? 1e-6));
        const current = cMul(complex(0, omega * c), cSub(n1, n2));
        elementCurrents[component.label] = cAbs(current);
        break;
      }
      case "diode": {
        const [aName, cName] = component.pinIds.map((pinId) => prepared.nodeMap.get(pinId) ?? "0");
        const a = aName === "0" ? complex() : solution[prepared.nodeIndex.get(aName)!] ?? complex();
        const c = cName === "0" ? complex() : solution[prepared.nodeIndex.get(cName)!] ?? complex();
        const vdBias = (biasState.nodeVoltages[aName] ?? 0) - (biasState.nodeVoltages[cName] ?? 0);
        const { gd } = diodeLinearization(vdBias);
        const current = cMul(complex(gd, 0), cSub(a, c));
        elementCurrents[component.label] = cAbs(current);
        break;
      }
      case "ground":
        break;
    }
  }

  return { nodeVoltages, elementCurrents };
}

function formatStateRawText(time: number, state: SimulationState): string {
  const lines = [`t = ${time.toExponential(6)} s`];
  for (const [name, value] of Object.entries(state.nodeVoltages)) lines.push(`V(${name}) = ${value.toFixed(6)} V`);
  for (const [name, value] of Object.entries(state.elementCurrents)) lines.push(`I(${name}) = ${value.toExponential(6)} A`);
  return lines.join("\n");
}

function formatAcRawText(frequencies: number[], lastState: SimulationState | null): string {
  if (!lastState || frequencies.length === 0) return "Sweep-i AC nuk prodhoi mostra.";
  const lastFrekuenca = frequencies[frequencies.length - 1];
  const lines = [
    `Sweep-i AC u përfundua me ${frequencies.length} mostra.`,
    `Frekuenca e fundit = ${lastFrekuenca.toFixed(3)} Hz`,
  ];
  for (const [name, value] of Object.entries(lastState.nodeVoltages)) lines.push(`|V(${name})| = ${value.toExponential(6)} V`);
  for (const [name, value] of Object.entries(lastState.elementCurrents)) lines.push(`|I(${name})| = ${value.toExponential(6)} A`);
  return lines.join("\n");
}

function buildSweepFrequencies(options: SimulationOptions): number[] {
  const start = Math.max(1e-6, options.acStartFrequency);
  const stop = Math.max(start, options.acStopFrequency);
  const points = Math.max(2, Math.floor(options.acPoints));

  if (options.acSpacing === "linear") {
    const step = (stop - start) / (points - 1);
    return Array.from({ length: points }, (_, index) => start + index * step);
  }

  const logStart = Math.log10(start);
  const logStop = Math.log10(stop);
  const step = (logStop - logStart) / (points - 1);
  return Array.from({ length: points }, (_, index) => 10 ** (logStart + index * step));
}

export async function runSimulation(
  document: CircuitDocument,
  options?: Partial<SimulationOptions>,
): Promise<SimulationResult> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const errors: string[] = [];

  if (!document.components.some((component) => component.type === "ground")) {
    errors.push("Qarku duhet të përfshijë një simbol toke.");
  }
  if (!document.components.some((component) => component.type === "vsource" || component.type === "acsource")) {
    errors.push("Shto të paktën një burim tensioni për të ngacmuar qarkun.");
  }
  if (config.mode === "ac" && !document.components.some((component) => component.type === "acsource")) {
    errors.push("Sweep-i AC kërkon të paktën një burim tensioni AC.");
  }
  if (document.components.length === 0) {
    errors.push("Qarku është bosh.");
  }

  if (errors.length > 0) {
    return {
      mode: config.mode,
      xValues: [],
      xLabel: config.mode === "ac" ? "Frekuenca" : "Koha",
      xUnit: config.mode === "ac" ? "Hz" : "s",
      nodeVoltages: {},
      elementCurrents: {},
      nodeNames: [],
      currentNames: [],
      rawText: errors.join("\n"),
      errors,
    };
  }

  const prepared = prepareCircuit(document);
  const xValues: number[] = [];
  const nodeVoltages: Record<string, number[]> = {};
  const elementCurrents: Record<string, number[]> = {};
  let rawText = "";

  const pushState = (x: number, state: SimulationState) => {
    xValues.push(x);
    for (const [name, value] of Object.entries(state.nodeVoltages)) {
      if (!nodeVoltages[name]) nodeVoltages[name] = [];
      nodeVoltages[name].push(value);
    }
    for (const [name, value] of Object.entries(state.elementCurrents)) {
      if (!elementCurrents[name]) elementCurrents[name] = [];
      elementCurrents[name].push(value);
    }
  };

  try {
    const opState = solveNonlinearStep(document, prepared, 0);

    if (config.mode === "op") {
      rawText = formatStateRawText(0, opState);
      pushState(0, opState);
    } else if (config.mode === "tran") {
      let previousState = opState;
      pushState(0, opState);
      rawText = formatStateRawText(0, opState);

      const stepCount = Math.max(1, Math.ceil(config.stopTime / config.timeStep));
      for (let step = 1; step <= stepCount; step += 1) {
        const t = Math.min(config.stopTime, step * config.timeStep);
        const currentState = solveNonlinearStep(document, prepared, t, previousState, config.timeStep);
        computeCapacitorCurrents(document, prepared, currentState, previousState, config.timeStep);
        pushState(t, currentState);
        previousState = currentState;
      }
      rawText = `${rawText}\n\nSimulimi tranzient u përfundua me ${xValues.length} mostra.`;
    } else {
      const frequencies = buildSweepFrequencies(config);
      let lastState: SimulationState | null = null;
      for (const frequency of frequencies) {
        const state = solveAcFrekuenca(document, prepared, frequency, opState);
        pushState(frequency, state);
        lastState = state;
      }
      rawText = formatAcRawText(frequencies, lastState);
      if (document.components.some((component) => component.type === "diode")) {
        rawText += "\n\nShënim: sweep-i AC përdor një linearizim me sinjal të vogël të diodës rreth pikës së punës DC.";
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Simulimi dështoi.";
    errors.push(message);
    rawText = message;
  }

  return {
    mode: config.mode,
    xValues,
    xLabel: config.mode === "ac" ? "Frekuenca" : "Koha",
    xUnit: config.mode === "ac" ? "Hz" : "s",
    nodeVoltages,
    elementCurrents,
    nodeNames: Object.keys(nodeVoltages).sort(),
    currentNames: Object.keys(elementCurrents).sort(),
    rawText,
    errors,
  };
}
