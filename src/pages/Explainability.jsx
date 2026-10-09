import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const revealUp = {
  hidden: { opacity: 0, y: 60 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }
};

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

export default function Explainability() {
  return (
    <div className="min-h-screen bg-slate-50 selection:bg-indigo-600 selection:text-white">
      {/* Subtle grid */}
      <div className="fixed inset-0 z-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:5rem_5rem] pointer-events-none"></div>

      {/* Minimal top bar */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <span className="material-symbols-outlined text-indigo-600 text-xl">arrow_back</span>
            <div>
              <h1 className="font-headline font-black text-slate-900 text-lg leading-none">PropIntel</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Return to Dashboard</p>
            </div>
          </Link>
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">System Transparency Report</span>
        </div>
      </header>

      <div className="relative z-10 max-w-6xl mx-auto px-8 py-20">

        {/* Page Title */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mb-32">
          <motion.p variants={revealUp} className="text-[12px] font-bold uppercase tracking-[0.3em] text-indigo-600 mb-6">
            [ Explainability ]
          </motion.p>
          <motion.h1 variants={revealUp} className="text-5xl md:text-7xl font-black text-slate-900 font-headline tracking-tight leading-[0.95] mb-8">
            How We <br/>Calculate Value.
          </motion.h1>
          <motion.p variants={revealUp} className="text-xl text-slate-500 max-w-2xl leading-relaxed">
            Every output PropIntel generates is traceable. This page maps the exact methodology, data sources, and AI models behind each metric — so your underwriting team never has to trust a black box.
          </motion.p>
        </motion.section>

        {/* SECTION 1: PIPELINE OVERVIEW */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="mb-32">
          <motion.div variants={revealUp} className="flex items-end justify-between border-b border-slate-200 pb-6 mb-12">
            <h2 className="text-3xl font-black text-slate-900 font-headline tracking-tight">Valuation Pipeline</h2>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">4-Stage Deterministic Flow</span>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { step: "01", title: "Geocode & Locate", icon: "location_on", desc: "Address resolved to precise coordinates via Komoot Photon geocoder backed by OpenStreetMap. Circle rate benchmarks are interpolated from government registry data." },
              { step: "02", title: "Feature Extraction", icon: "architecture", desc: "Property type, area, vintage, floor level, and configuration are structured into a feature vector. Depreciation curves are applied based on building age brackets." },
              { step: "03", title: "Vision Inference", icon: "camera_enhance", desc: "Property images are processed by OwlViT (google/owlvit-base-patch32) running natively on GPU via CUDA PyTorch. Zero-shot detection identifies structural fractures, water damage, and degradation." },
              { step: "04", title: "Liquidity Synthesis", icon: "analytics", desc: "All feature signals are composed into final outputs: Market Value range, Distress Value, Resale Potential Index (0–100), and Estimated Time to Liquidate." }
            ].map((s, i) => (
              <motion.div key={i} variants={revealUp} className="bg-white border border-slate-200 rounded-xl p-6 hover:border-indigo-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-3xl font-headline font-black text-indigo-100">{s.step}</span>
                  <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-indigo-600 border border-slate-100">
                    <span className="material-symbols-outlined text-lg">{s.icon}</span>
                  </div>
                </div>
                <h3 className="font-bold text-slate-900 mb-3">{s.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed flex-1">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* SECTION 2: VALUATION LOGIC */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="mb-32">
          <motion.div variants={revealUp} className="flex items-end justify-between border-b border-slate-200 pb-6 mb-12">
            <h2 className="text-3xl font-black text-slate-900 font-headline tracking-tight">Valuation Logic</h2>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Mathematical Framework</span>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <motion.div variants={revealUp} className="bg-white border border-slate-200 rounded-xl p-8">
              <h3 className="font-bold text-slate-900 mb-2">Market Value Estimation</h3>
              <p className="text-sm text-slate-500 mb-6">Market Value is a function of multiple orthogonal signals — not a single regression.</p>
              <div className="bg-slate-900 rounded-lg p-5 font-mono text-sm text-indigo-300 leading-relaxed overflow-x-auto">
                <span className="text-slate-500">// Composite valuation model</span><br/>
                Market_Value = f(<br/>
                &nbsp;&nbsp;circle_rate_benchmark,<br/>
                &nbsp;&nbsp;location_premium,<br/>
                &nbsp;&nbsp;property_type &amp; size,<br/>
                &nbsp;&nbsp;age_depreciation_curve,<br/>
                &nbsp;&nbsp;infrastructure_score,<br/>
                &nbsp;&nbsp;rental_yield<br/>
                )<br/><br/>
                <span className="text-slate-500">// Output: Value range, not point estimate</span>
              </div>
            </motion.div>

            <motion.div variants={revealUp} className="bg-white border border-slate-200 rounded-xl p-8">
              <h3 className="font-bold text-slate-900 mb-2">Distress Sale Value</h3>
              <p className="text-sm text-slate-500 mb-6">Conservative exit pricing applying type-specific liquidity discounts.</p>
              <div className="bg-slate-900 rounded-lg p-5 font-mono text-sm text-indigo-300 leading-relaxed overflow-x-auto">
                <span className="text-slate-500">// Liquidity-adjusted valuation</span><br/>
                Distress_Value = Market_Value × Liquidity_Discount<br/><br/>
                <span className="text-slate-500">// Discount factors</span><br/>
                Liquidity_Discount = g(<br/>
                &nbsp;&nbsp;asset_type,&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-emerald-400">// residential vs niche</span><br/>
                &nbsp;&nbsp;location_demand,&nbsp;&nbsp;<span className="text-emerald-400">// micro-market absorption</span><br/>
                &nbsp;&nbsp;legal_clarity&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-emerald-400">// freehold vs leasehold</span><br/>
                )
              </div>
            </motion.div>
          </div>
        </motion.section>

        {/* SECTION 3: RESALE INDEX */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="mb-32">
          <motion.div variants={revealUp} className="flex items-end justify-between border-b border-slate-200 pb-6 mb-12">
            <h2 className="text-3xl font-black text-slate-900 font-headline tracking-tight">Resale Potential Index</h2>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">0 – 100 Consolidated Signal</span>
          </motion.div>

          <motion.div variants={revealUp} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-6 py-4 font-bold text-slate-900 uppercase text-[11px] tracking-wider">Factor</th>
                  <th className="text-left px-6 py-4 font-bold text-slate-900 uppercase text-[11px] tracking-wider">Direction</th>
                  <th className="text-left px-6 py-4 font-bold text-slate-900 uppercase text-[11px] tracking-wider">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { factor: "Prime Location", dir: "↑ Increases", color: "text-emerald-600", rationale: "Higher demand guarantees faster absorption and buyer pool depth." },
                  { factor: "Standard Configuration (2BHK)", dir: "↑ Increases", color: "text-emerald-600", rationale: "Maximum fungibility — largest addressable market segment." },
                  { factor: "High Demand Micro-Market", dir: "↑ Increases", color: "text-emerald-600", rationale: "Active listing volume signals healthy transaction velocity." },
                  { factor: "Older Construction (>15 yrs)", dir: "↓ Decreases", color: "text-red-500", rationale: "Structural depreciation and reduced remaining useful life." },
                  { factor: "Legal Complexity", dir: "↓ Decreases", color: "text-red-500", rationale: "Title disputes or leasehold status suppress buyer confidence." },
                  { factor: "Niche Asset Profile", dir: "↓ Decreases", color: "text-red-500", rationale: "Custom/non-standard assets shrink addressable buyer pool." }
                ].map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-800">{row.factor}</td>
                    <td className={`px-6 py-4 font-bold ${row.color}`}>{row.dir}</td>
                    <td className="px-6 py-4 text-slate-500">{row.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>

          <motion.div variants={revealUp} className="grid grid-cols-3 gap-6 mt-8">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
              <p className="text-2xl font-headline font-black text-emerald-700">80 – 100</p>
              <p className="text-xs font-bold text-emerald-600 mt-1">Highly Liquid</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
              <p className="text-2xl font-headline font-black text-amber-700">50 – 80</p>
              <p className="text-xs font-bold text-amber-600 mt-1">Moderate Liquidity</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
              <p className="text-2xl font-headline font-black text-red-700">&lt; 50</p>
              <p className="text-xs font-bold text-red-600 mt-1">Illiquid / Specialised</p>
            </div>
          </motion.div>
        </motion.section>

        {/* SECTION 4: AI / ML STACK */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="mb-32">
          <motion.div variants={revealUp} className="flex items-end justify-between border-b border-slate-200 pb-6 mb-12">
            <h2 className="text-3xl font-black text-slate-900 font-headline tracking-tight">Technology Stack</h2>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Models & Infrastructure</span>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {[
              { span: "lg:col-span-4", title: "Vision Model", model: "OwlViT", detail: "google/owlvit-base-patch32", items: ["Zero-shot object detection", "Structural fracture identification", "Water damage & degradation markers", "Native CUDA PyTorch inference"] },
              { span: "lg:col-span-4", title: "Geocoding Engine", model: "Photon", detail: "Komoot / OpenStreetMap", items: ["Building-level resolution", "Reverse geocoding for verification", "Infrastructure proximity via Haversine", "Circle rate zone interpolation"] },
              { span: "lg:col-span-4", title: "Compute Backend", model: "CUDA", detail: "NVIDIA RTX / Blackwell Architecture", items: ["PyTorch tensor acceleration", "Sub-second inference latency", "On-premise — zero data egress", "Direct Tensor Core mapping"] }
            ].map((stack, i) => (
              <motion.div key={i} variants={revealUp} className={`${stack.span} bg-white border border-slate-200 rounded-xl p-8 hover:border-indigo-200 transition-colors`}>
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-3">{stack.title}</p>
                <h3 className="text-2xl font-headline font-black text-slate-900 mb-1">{stack.model}</h3>
                <p className="text-xs font-mono text-slate-400 mb-6">{stack.detail}</p>
                <ul className="space-y-3">
                  {stack.items.map((item, j) => (
                    <li key={j} className="flex items-center gap-3 text-sm text-slate-600">
                      <span className="w-1 h-1 bg-indigo-600 rounded-full flex-shrink-0"></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* SECTION 5: SAFEGUARDS */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="mb-20">
          <motion.div variants={revealUp} className="flex items-end justify-between border-b border-slate-200 pb-6 mb-12">
            <h2 className="text-3xl font-black text-slate-900 font-headline tracking-tight">Fraud Safeguards</h2>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Integrity Checks</span>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: "straighten", title: "Size Sanity", desc: "Declared property area is validated against locality norms. Outliers are flagged for manual verification." },
              { icon: "wrong_location", title: "Location Mismatch", desc: "Geocoded coordinates are cross-referenced with declared address. Significant deviation triggers a risk flag." },
              { icon: "category", title: "Type Plausibility", desc: "Declared property type and configuration are validated against neighbourhood typology and listing data." }
            ].map((guard, i) => (
              <motion.div key={i} variants={revealUp} className="bg-white border border-slate-200 rounded-xl p-6 hover:border-red-200 transition-colors">
                <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center text-red-500 border border-red-100 mb-5">
                  <span className="material-symbols-outlined">{guard.icon}</span>
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{guard.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{guard.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

      </div>
    </div>
  );
}
