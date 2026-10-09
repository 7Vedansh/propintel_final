import React from 'react';
import { motion } from 'framer-motion';

export default function LandingHub({ onInitialize }) {
  const revealUp = {
    hidden: { opacity: 0, y: 100 },
    visible: { opacity: 1, y: 0, transition: { duration: 1, ease: [0.16, 1, 0.3, 1] } }
  };

  const imageReveal = {
    hidden: { scale: 1.1, opacity: 0 },
    visible: { scale: 1, opacity: 1, transition: { duration: 1.5, ease: [0.16, 1, 0.3, 1] } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 relative selection:bg-indigo-600 selection:text-white pb-32">
      {/* Absolute minimalist grid */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:5rem_5rem] pointer-events-none"></div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-12 lg:px-24">

        {/* SWISS HERO SECTION */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="min-h-[85vh] flex flex-col justify-end pt-6 pb-24"
        >
          <div className="max-w-4xl">
            <motion.h4 variants={revealUp} className="text-[12px] font-bold uppercase tracking-[0.3em] text-indigo-600 mb-8">
              [ Institutional Collateral Intelligence ]
            </motion.h4>
            <motion.h1 variants={revealUp} className="text-6xl md:text-8xl lg:text-[110px] font-black text-slate-900 font-headline leading-[0.85] tracking-tighter mb-12">
              LIQUIDITY <br />
              <span className="text-indigo-600/20">ENGINE.</span>
            </motion.h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-16 border-t border-slate-200 pt-8">
              <motion.p variants={revealUp} className="text-xl text-slate-600 font-medium leading-relaxed">
                Empowering NBFCs and secured lenders to underwrite with absolute certainty. PropIntel combines intrinsic asset valuation with deterministic market exit risk, eliminating manual variance to accelerate your credit decisions.
              </motion.p>
              <motion.div variants={revealUp} className="flex md:justify-end items-start border-none">
                <button
                  onClick={onInitialize}
                  className="group relative flex items-center gap-6 bg-indigo-600 text-white px-8 py-5 hover:bg-slate-900 transition-colors duration-500 font-bold uppercase tracking-[0.2em] text-xs shadow-xl shadow-indigo-600/20"
                >
                  Launch Platform
                  <span className="material-symbols-outlined transform group-hover:translate-x-2 transition-transform duration-300">arrow_forward</span>
                </button>
              </motion.div>
            </div>
          </div>
        </motion.section>

        {/* FULL BLEED IMAGE REVEAL */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="w-full aspect-[21/9] bg-slate-200 overflow-hidden mb-32 rounded-sm"
        >
          <motion.img
            variants={imageReveal}
            src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80"
            alt="Institutional Real Estate"
            className="w-full h-full object-cover grayscale opacity-80 mix-blend-multiply transition-all duration-[2000ms] hover:grayscale-0 hover:scale-105"
          />
        </motion.section>

        {/* THE "OUTPUTS" - MASSIVE TYPOGRAPHY METRICS */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="mb-40"
        >
          <div className="flex flex-col md:flex-row justify-between items-end border-b border-indigo-200 pb-8 mb-16">
            <motion.h2 variants={revealUp} className="text-4xl md:text-5xl font-black text-slate-900 font-headline tracking-tighter">
              INSTITUTIONAL <br />METRICS.
            </motion.h2>
            <motion.p variants={revealUp} className="text-sm font-bold text-indigo-600 uppercase tracking-widest mt-4 md:mt-0 text-right">
              We believe you care as much about exit certainty <br />as you do about valuation.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-20">
            {[
              { val: "₹ Range", label: "Estimated Market Value", tag: "Intrinsic" },
              { val: "₹ Range", label: "Risk-Adjusted Distress Value", tag: "Conservative" },
              { val: "0–100", label: "Resale Potential Index", tag: "Exit Certainty" },
              { val: "Days", label: "Liquidation Velocity", tag: "Actionable" }
            ].map((output, i) => (
              <motion.div key={i} variants={revealUp} className="flex flex-col">
                <span className="text-xs font-bold border border-indigo-200 bg-indigo-50 py-1 px-3 rounded-full self-start mb-6 text-indigo-700 uppercase tracking-widest">{output.tag}</span>
                <h3 className="text-4xl font-headline font-black text-slate-900 mb-4 tracking-tighter">{output.val}</h3>
                <p className="text-sm font-bold text-slate-600">{output.label}</p>
                <div className="w-full h-px bg-slate-200 mt-6"></div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* SWISS GRID: FRAMEWORK */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
            <div className="lg:col-span-4">
              <motion.h2 variants={revealUp} className="text-4xl font-black text-slate-900 font-headline tracking-tighter sticky top-12">
                INTELLIGENCE <br />FRAMEWORK.
              </motion.h2>
            </div>

            <div className="lg:col-span-8 flex flex-col space-y-12">
              {[
                { step: "01", title: "Location Intelligence", desc: "The primary driver. Establishes the statutory floor value via circle rates, combined with market activity proxies and proximity to critical infrastructure." },
                { step: "02", title: "Property Attributes", desc: "Core identifiers integrating asset sub-type, total footprint, and structural vintage. These factors directly dictate physical depreciation and buyer demand." },
                { step: "03", title: "Legal & Ownership", desc: "Freehold versus leasehold status and title clarity. Directly manipulates underwriting LTV limits and strictly governs overall resale liquidity." },
                { step: "04", title: "Market Dynamics Layer", desc: "Real-time supply-demand absorption indicators scaling asset fungibility. Niche configurations penalize liquidity, while standard configurations guarantee velocity." }
              ].map((feat, i) => (
                <motion.div key={i} variants={revealUp} className="grid grid-cols-1 md:grid-cols-12 gap-6 border-b border-indigo-100 pb-12 group">
                  <div className="md:col-span-2">
                    <span className="text-xl font-headline font-black text-indigo-300 group-hover:text-indigo-600 transition-colors">{feat.step}.</span>
                  </div>
                  <div className="md:col-span-4">
                    <h4 className="text-lg font-bold text-slate-900">{feat.title}</h4>
                  </div>
                  <div className="md:col-span-6">
                    <p className="text-sm text-slate-500 leading-relaxed font-medium">{feat.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

      </div>
    </div>
  );
}
