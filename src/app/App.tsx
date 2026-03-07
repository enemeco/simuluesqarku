import { SchematicCanvas } from "../components/canvas/SchematicCanvas";
import { InspectorPanel } from "../components/inspector/InspectorPanel";
import { WaveformPanel } from "../components/plots/WaveformPanel";
import { Palette } from "../components/sidebar/Palette";
import { Toolbar } from "../components/toolbar/Toolbar";
import "../styles/app.css";

export default function App() {
  return (
    <div className="app-shell">
      <Toolbar />
      <div className="main-layout">
        <aside className="left-panel">
          <Palette />
        </aside>
        <section className="center-panel">
          <main className="canvas-panel">
            <SchematicCanvas />
          </main>
          <WaveformPanel />
        </section>
        <aside className="right-panel">
          <InspectorPanel />
        </aside>
      </div>
    </div>
  );
}
