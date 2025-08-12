// Server component page; DotGlobe mounts client-side via dynamic import
import dynamic from "next/dynamic";
const DotGlobe = dynamic(() => import("../components/DotGlobe"), { ssr: false });

export default function Page() {
  return (
    <main className="min-h-screen w-full bg-[#0b1021] text-white">
      <div className="mx-auto max-w-6xl px-6 pt-10 pb-16">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-6">
          Three.js Interactive Dot Globe
        </h1>
        <p className="text-white/80 mb-8">
          Drag to rotate, scroll to zoom. Hover near a point to gently scatter particles. Use the panel to tweak.
        </p>
        <DotGlobe />
      </div>
    </main>
  );
}
