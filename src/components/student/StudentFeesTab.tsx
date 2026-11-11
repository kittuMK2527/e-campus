"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, X, CreditCard, AlertCircle, IndianRupee } from "lucide-react";
import { qk } from "@/lib/queryKeys";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/context/ToastContext";
import { Dialog } from "@/components/ui/dialog";

interface StudentFeesTabProps {
  currentStudent: any;
}

export default function StudentFeesTab({ currentStudent }: StudentFeesTabProps) {
  const { toast } = useToast();

  const feeQuery = useQuery({
    queryKey: qk.studentFees(currentStudent?.id || "none"),
    enabled: !!currentStudent?.id,
    queryFn: async () => apiFetch(`/api/fees?role=student&studentId=${encodeURIComponent(currentStudent!.id)}`),
  });

  const feeData = feeQuery.data || null;
  const feeLoading = feeQuery.isFetching;

  const [feePayModal, setFeePayModal] = useState<any | null>(null);
  const [feePayAmount, setFeePayAmount] = useState("");
  const [feePayMethod, setFeePayMethod] = useState("online");
  const [feePaySubmitting, setFeePaySubmitting] = useState(false);
  const [feePaySuccess, setFeePaySuccess] = useState<string | null>(null);

  const handleFeePayment = async () => {
    if (!feePayModal || !feePayAmount || !currentStudent) return;
    setFeePaySubmitting(true);
    try {
      const res = await fetch("/api/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeId: feePayModal.id,
          studentId: currentStudent.id,
          amount: Number(feePayAmount),
          paymentMethod: feePayMethod,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setFeePaySuccess(json.receiptNo || "Recorded");
        await feeQuery.refetch();
      } else {
        toast(json.message || "Payment could not be recorded.", "error");
      }
    } catch (err: any) {
      toast(err?.message || "Payment could not be recorded.", "error");
    } finally {
      setFeePaySubmitting(false);
    }
  };

  const fmtR = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  if (feeLoading && !feeData) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
        <span className="text-xs font-semibold text-slate-500">Loading fee records…</span>
      </div>
    );
  }

  if (!feeData) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl p-8 space-y-4 shadow-xs text-center max-w-lg mx-auto my-6">
        <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-sm font-bold text-slate-800">Fee Details Unavailable</h2>
        <p className="text-xs text-slate-500">Unable to retrieve student fee records. Please check your network connection.</p>
        <button
          onClick={() => feeQuery.refetch()}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs"
        >
          Try Again
        </button>
      </div>
    );
  }

  const { fees = [], payments = [], stats = { totalFees: 0, totalPaid: 0, totalOutstanding: 0, unpaidCount: 0 } } = feeData;

  return (
    <div className="space-y-6 font-sans">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Assigned Fees", value: fmtR(stats.totalFees), color: "text-slate-900", icon: IndianRupee, bg: "bg-white", border: "border-slate-200/80" },
          { label: "Total Amount Paid", value: fmtR(stats.totalPaid), color: "text-emerald-700", icon: CheckCircle2, bg: "bg-emerald-50/40", border: "border-emerald-200/60" },
          { label: "Pending Balance", value: fmtR(stats.totalOutstanding), color: stats.totalOutstanding > 0 ? "text-rose-700" : "text-slate-600", icon: CreditCard, bg: stats.totalOutstanding > 0 ? "bg-rose-50/40" : "bg-white", border: stats.totalOutstanding > 0 ? "border-rose-200/60" : "border-slate-200/80" },
          { label: "Payment Status", value: stats.unpaidCount > 0 ? `${stats.unpaidCount} Pending` : "All Cleared", color: stats.unpaidCount > 0 ? "text-amber-700" : "text-emerald-700", icon: CheckCircle2, bg: stats.unpaidCount > 0 ? "bg-amber-50/40" : "bg-emerald-50/40", border: stats.unpaidCount > 0 ? "border-amber-200/60" : "border-emerald-200/60" },
        ].map(({ label, value, color, icon: Icon, bg, border }) => (
          <div key={label} className={`rounded-2xl p-4 border ${border} ${bg} shadow-xs transition-all`}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
              <Icon className="h-4 w-4 text-slate-400 opacity-80" />
            </div>
            <p className={`text-xl font-extrabold mt-2 tracking-tight ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Fee Breakdown List */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Fee Schedule & Dues</h3>
            <p className="text-xs text-slate-400">Institutional tuition and exam fee milestones</p>
          </div>
          <button
            onClick={() => feeQuery.refetch()}
            aria-label="Refresh fee ledger"
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${feeLoading ? "animate-spin text-indigo-600" : ""}`} />
          </button>
        </div>

        <div className="space-y-3">
          {fees.map((fee: any) => (
            <div
              key={fee.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50/80 transition-colors gap-3"
            >
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-900">{fee.term_name}</h4>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
                  <span>Total: <span className="font-semibold text-slate-800">{fmtR(fee.amount)}</span></span>
                  <span>•</span>
                  <span>Paid: <span className="font-semibold text-slate-800">{fmtR(fee.paid_amount)}</span></span>
                  {fee.due_date && (
                    <>
                      <span>•</span>
                      <span>Due: <span className="font-medium text-slate-700">{fee.due_date}</span></span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                {fee.status === "paid" ? (
                  <span className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[11px] font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Paid in Full
                  </span>
                ) : (
                  <>
                    {fee.status === "partial" && (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/60 text-[10px] font-bold">
                        Partial
                      </span>
                    )}
                    {fee.pay_link ? (
                      <a
                        href={fee.pay_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-1.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all inline-block text-center"
                      >
                        Pay Online
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setFeePayModal(fee);
                          setFeePayAmount(String(fee.amount - fee.paid_amount));
                          setFeePaySuccess(null);
                        }}
                        className="py-1.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all inline-block text-center"
                      >
                        Pay Now
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {fees.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-8">No fee obligations assigned to your profile.</p>
          )}
        </div>
      </div>

      {/* Payment History */}
      {payments.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800">Transaction History</h3>
            <p className="text-xs text-slate-400">Verified receipts and online transaction traces</p>
          </div>
          <div className="space-y-2">
            {[...payments]
              .sort((a: any, b: any) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())
              .map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50/60 border border-slate-100 text-xs hover:bg-slate-50 transition-colors"
                >
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-800">{p.receipt_no}</p>
                    <p className="text-[10px] text-slate-400 font-mono">Ref: {p.reference_no}</p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200/50 text-indigo-700 text-[10px] font-bold capitalize">
                    {p.payment_method}
                  </span>
                  <div className="text-right">
                    <p className="font-extrabold text-slate-900">{fmtR(p.amount)}</p>
                    <p className="text-[10px] text-slate-400">
                      {new Date(p.payment_date).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Online Payment Modal */}
      {feePayModal && (
        <Dialog
          open={true}
          onOpenChange={(next) => {
            if (!next) setFeePayModal(null);
          }}
          ariaLabel="Pay fee online"
          overlayClassName="bg-slate-950/60 backdrop-blur-xs"
          panelClassName="max-w-md p-6 space-y-0"
        >
          {feePaySuccess ? (
            <div className="text-center space-y-4 py-2">
              <div className="h-14 w-14 rounded-2xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center mx-auto text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Payment Successful</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Receipt Reference: <span className="font-bold text-indigo-600">{feePaySuccess}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFeePayModal(null)}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Pay Fee Online</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{feePayModal.term_name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFeePayModal(null)}
                  aria-label="Close dialog"
                  className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-100">
                  <span className="font-semibold text-slate-700">Outstanding Balance</span>
                  <span className="font-extrabold text-indigo-700 text-sm">
                    {fmtR(feePayModal.amount - feePayModal.paid_amount)}
                  </span>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Payment Amount (₹)</label>
                  <input
                    aria-label="Amount in Rupees"
                    type="number"
                    value={feePayAmount}
                    onChange={(e) => setFeePayAmount(e.target.value)}
                    max={feePayModal.amount - feePayModal.paid_amount}
                    placeholder="Enter amount"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "online", label: "UPI / Net Banking" },
                      { id: "card", label: "Debit / Credit Card" },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFeePayMethod(id)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                          feePayMethod === id
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                            : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setFeePayModal(null)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleFeePayment}
                    disabled={!feePayAmount || feePaySubmitting}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all disabled:opacity-50"
                  >
                    {feePaySubmitting ? "Processing…" : "Confirm Payment"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
