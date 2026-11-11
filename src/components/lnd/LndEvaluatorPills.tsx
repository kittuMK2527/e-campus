"use client";

interface LndEvaluatorPillsProps {
  /** Evaluators in scope after the campus / department filters. */
  smes: any[];
  /** "all" for the unified matrix, otherwise a single evaluator id. */
  selectedId: string;
  onSelect: (id: string) => void;
}

/**
 * One-tap switch between the unified matrix and a single evaluator's week. Mirrors the evaluator
 * combobox rather than replacing it - the combobox still searches a long roster.
 */
export default function LndEvaluatorPills({ smes, selectedId, onSelect }: LndEvaluatorPillsProps) {
  const pill = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-[10px] font-black border transition-all cursor-pointer ${
      active
        ? "bg-[#4F46E5] text-white border-[#4F46E5] shadow-2xs"
        : "bg-white/80 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#4F46E5]/50 hover:text-[#4F46E5] dark:hover:text-[#818CF8]"
    }`;

  return (
    <div
      role="group"
      aria-label="Evaluator view"
      className="flex flex-wrap items-center gap-1.5 max-h-[92px] overflow-y-auto no-scrollbar"
    >
      <button type="button" aria-pressed={selectedId === "all"} onClick={() => onSelect("all")} className={pill(selectedId === "all")}>
        All Evaluators (Unified Summary)
      </button>
      {smes.map(sme => {
        const active = selectedId === sme.id;
        return (
          <button
            key={sme.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? "all" : sme.id)}
            title={`${sme.name}${sme.subject ? ` · ${sme.subject}` : ""}`}
            className={pill(active)}
          >
            {sme.name}
            {sme.subject ? <span className={active ? "text-white/70" : "text-slate-400"}> · {sme.subject}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
