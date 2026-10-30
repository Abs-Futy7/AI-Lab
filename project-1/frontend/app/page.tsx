import Link from "next/link";
import {
  Activity, Ambulance, ArrowRight, BrainCircuit, GitCompareArrows,
  MapPinned, Network, Route, ShieldCheck, Sparkles,
} from "lucide-react";
import "./landing.css";

const projects = [
  {
    number: "01", eyebrow: "Graph Search", title: "Emergency Route Planning",
    description: "Explore how six uninformed and informed search algorithms navigate a real directed road network in Central Dhaka.",
    href: "/lab1", accent: "blue", icon: Route,
    algorithms: ["BFS", "DFS", "UCS", "IDS", "Greedy", "A*"],
    features: ["Live node-expansion playback", "Traffic and blocked-road scenarios", "Cost, route and runtime comparison"],
  },
  {
    number: "02", eyebrow: "Constraint Satisfaction", title: "Emergency Resource Allocation",
    description: "Allocate ambulances, fire units and rescue teams to simultaneous incidents while satisfying operational constraints.",
    href: "/lab2", accent: "orange", icon: BrainCircuit,
    algorithms: ["AC-3", "MRV", "Degree", "LCV", "Backtracking", "Backjumping", "Min-Conflicts"],
    features: ["Fleet and station simulation", "Step-by-step allocation playback", "Solver profiles and CSP inspection"],
  },
] as const;

export default function Home() {
  return (
    <main className="project-hub">
      <header className="hub-header">
        <Link href="/" className="hub-brand"><span><Network size={23} /></span><div><strong>AI LABORATORY</strong><small>Search · Constraints · Simulation</small></div></Link>
        <div className="hub-status"><Activity size={15} /><span>Two interactive projects online</span></div>
      </header>

      <section className="hub-hero">
        <div className="hero-copy">
          <span className="hero-kicker"><Sparkles size={15} /> University AI laboratory collection</span>
          <h1>Choose a project to<br /><em>start exploring.</em></h1>
          <p>Two independent, interactive demonstrations built on the same Central Dhaka road environment. Select a project below to open its complete experiment workspace.</p>
          <div className="hero-facts"><span><MapPinned size={16} /> Real road topology</span><span><ShieldCheck size={16} /> Manual AI algorithms</span><span><GitCompareArrows size={16} /> Live comparisons</span></div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="visual-orbit orbit-one"><i /><i /><i /></div><div className="visual-orbit orbit-two"><i /><i /></div>
          <span className="visual-core"><Ambulance size={36} /></span><b className="visual-label search">SEARCH</b><b className="visual-label csp">CSP</b>
        </div>
      </section>

      <section className="project-list" aria-labelledby="project-list-title">
        <div className="project-list-heading"><div><span>PROJECT DIRECTORY</span><h2 id="project-list-title">Interactive lab projects</h2></div><p>Each project has its own controls, visualization, algorithms and analysis.</p></div>
        <div className="project-card-grid">
          {projects.map((project) => {
            const Icon = project.icon;
            return <article className={`project-card ${project.accent}`} key={project.number}>
              <div className="project-card-top"><span className="project-number">PROJECT {project.number}</span><span className="project-type">{project.eyebrow}</span></div>
              <div className="project-icon"><Icon size={29} /></div><h3>{project.title}</h3><p>{project.description}</p>
              <div className="algorithm-tags">{project.algorithms.map((algorithm) => <span key={algorithm}>{algorithm}</span>)}</div>
              <ul>{project.features.map((feature) => <li key={feature}><ShieldCheck size={15} />{feature}</li>)}</ul>
              <Link href={project.href} className="open-project">Open Project {project.number}<ArrowRight size={18} /></Link>
              {project.number === "01" && <Link href="/simulation" className="project-secondary-link"><GitCompareArrows size={15} /> Open six-way live comparison</Link>}
            </article>;
          })}
        </div>
      </section>
      <footer className="hub-footer"><span>Artificial Intelligence Laboratory · Central Dhaka simulation environment</span><span>Educational use only · OpenStreetMap road data</span></footer>
    </main>
  );
}
