import { Moon } from "lucide-react";

export default function LndLegendCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
      {/* Card 1: Legend */}
      <div className="bg-white/80 dark:bg-[#131317]/80 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-card space-y-4 backdrop-blur-md">
        <h3 className="text-xs font-black uppercase text-slate-700 dark:text-white tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">Legend</h3>
        <div className="grid grid-cols-2 gap-3 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded bg-emerald-500 shadow-xs shrink-0" />
            <div>
              <span className="font-bold text-slate-800 dark:text-white block leading-none">Free Slot</span>
              <span className="text-[8.5px] text-slate-400 block mt-0.5">Available for L&D</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded bg-slate-300 dark:bg-slate-700 shadow-xs shrink-0" />
            <div>
              <span className="font-bold text-slate-800 dark:text-white block leading-none">Busy Slot</span>
              <span className="text-[8.5px] text-slate-400 block mt-0.5">Teaching / Evaluation</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded bg-[#D528A2] shadow-xs shrink-0" />
            <div>
              <span className="font-bold text-slate-800 dark:text-white block leading-none">L&D Session Booked</span>
              <span className="text-[8.5px] text-slate-400 block mt-0.5">Already scheduled</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded bg-[#F4A863] shadow-xs shrink-0" />
            <div>
              <span className="font-bold text-slate-800 dark:text-white block leading-none">Draft Preview</span>
              <span className="text-[8.5px] text-slate-400 block mt-0.5">Not yet confirmed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Info */}
      <div className="bg-white/80 dark:bg-[#131317]/80 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-card space-y-3 backdrop-blur-md">
        <h3 className="text-xs font-black uppercase text-slate-700 dark:text-white tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">Guidelines</h3>
        <ul className="list-disc pl-4 text-[10.5px] text-slate-500 dark:text-slate-400 space-y-1.5 font-semibold">
          <li>Time slots are configured in 60-minute duration blocks</li>
          <li>Campus lunch breaks are automatically excluded from allocations</li>
          <li>Beyond regular college hours slots appear below the evening divider</li>
        </ul>
      </div>

      {/* Card 3: Beyond College Hours */}
      <div className="bg-white/80 dark:bg-[#131317]/80 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-card space-y-3 flex flex-col justify-between backdrop-blur-md">
        <div>
          <h3 className="text-xs font-black uppercase text-slate-700 dark:text-white tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-1.5">
            <Moon className="h-3.5 w-3.5 text-[#D528A2]" />
            Beyond College Hours
          </h3>
          <div className="pt-2 text-[10.5px] font-bold text-slate-700 dark:text-slate-300 space-y-1.5">
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
              <span>Slot 1:</span>
              <span className="text-[#D528A2] dark:text-[#f45fc6] font-extrabold">04:30 PM - 05:30 PM</span>
            </div>
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
              <span>Slot 2:</span>
              <span className="text-[#D528A2] dark:text-[#f45fc6] font-extrabold">05:30 PM - 06:30 PM</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
