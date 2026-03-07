import { generateNetlist } from "../../circuit/netlist/generateNetlist";
import { useCircuitStore } from "../../store/useCircuitStore";

export function Toolbar() {
  const document = useCircuitStore((s) => s.document);
  const pendingWirePinId = useCircuitStore((s) => s.pendingWirePinId);
  const clearPendingWire = useCircuitStore((s) => s.clearPendingWire);
  const runSimulation = useCircuitStore((s) => s.runSimulation);
  const rotateSelected = useCircuitStore((s) => s.rotateSelected);
  const deleteSelected = useCircuitStore((s) => s.deleteSelected);
  const selectedComponentId = useCircuitStore((s) => s.selectedComponentId);
  const isSimulating = useCircuitStore((s) => s.isSimulating);

  const handleExport = () => {
    const netlist = generateNetlist(document);
    console.log(netlist);
    window.alert(netlist);
  };

  return (
    <header className="toolbar">
      <div>
        <div className="toolbar-title">Simuluesi i Qarqeve</div>
        <div className="toolbar-subtitle">
          {pendingWirePinId
            ? "Mënyra e telit: zgjidh pinin e dytë"
            : "Shtyp R për rrotullim ose tastin Delete për të hequr komponentin e zgjedhur"}
        </div>
      </div>
      <div className="toolbar-actions">
        {pendingWirePinId && <button onClick={clearPendingWire}>Anulo telin</button>}
        <button disabled={!selectedComponentId} onClick={rotateSelected}>Rrotullo</button>
        <button disabled={!selectedComponentId} onClick={deleteSelected}>Fshi</button>
        <button disabled={isSimulating} onClick={() => void runSimulation("op")}>Ekzekuto OP</button>
        <button disabled={isSimulating} onClick={() => void runSimulation("tran")}>Ekzekuto tranzienten</button>
        <button disabled={isSimulating} onClick={() => void runSimulation("ac")}>Ekzekuto sweep-in AC</button>
        <button onClick={handleExport}>Eksporto netlistën</button>
      </div>
    </header>
  );
}
