/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  CarModel, 
  PaintColor, 
  WheelDesign, 
  WheelFinish, 
  BrochureLead 
} from '../types';
import confetti from 'canvas-confetti';
import { 
  X, 
  CheckCircle, 
  FileText, 
  Download, 
  Phone, 
  Mail, 
  User, 
  Calendar, 
  ShieldCheck, 
  Sparkles,
  ArrowRight,
  Printer
} from 'lucide-react';

interface BrochureModalProps {
  isOpen: boolean;
  onClose: () => void;
  car: CarModel;
  paint: PaintColor;
  wheel: WheelDesign;
  finish: WheelFinish;
  price: number;
  wheelSize: string;
  onSaveLead: (lead: BrochureLead) => void;
}

export const BrochureModal: React.FC<BrochureModalProps> = ({
  isOpen,
  onClose,
  car,
  paint,
  wheel,
  finish,
  price,
  wheelSize,
  onSaveLead
}) => {
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [cellNumber, setCellNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [requestConsultation, setRequestConsultation] = useState(true);

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedLead, setSubmittedLead] = useState<BrochureLead | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !surname.trim() || !email.trim() || !cellNumber.trim()) {
      alert('Please provide your name, surname, email, and cell number.');
      return;
    }

    const newLead: BrochureLead = {
      id: `lead_${Date.now()}`,
      name: name.trim(),
      surname: surname.trim(),
      email: email.trim(),
      cellNumber: cellNumber.trim(),
      carModel: car.name,
      paintColor: `${paint.name} (${paint.code})`,
      wheelModel: `${wheel.name} (${wheel.code})`,
      wheelFinish: finish.name,
      wheelSize: wheelSize,
      caliperColor: '',
      requestFitmentConsultation: requestConsultation,
      notes: notes.trim(),
      timestamp: new Date().toISOString()
    };

    onSaveLead(newLead);
    setSubmittedLead(newLead);
    setIsSubmitted(true);

    // Fire celebratory confetti
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch {
      // ignore
    }
  };

  const handlePrintBrochure = () => {
    window.print();
  };

  const handleReset = () => {
    setIsSubmitted(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-black border border-white/[0.12] rounded-2xl shadow-2xl overflow-hidden my-8 ring-1 ring-white/[0.06]">
        {/* Modal Header */}
        <div className="p-6 border-b border-white/[0.08] bg-black flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF5500]/10 border border-[#FF5500]/30 flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#FF5500]" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white uppercase tracking-tight">
                {isSubmitted ? 'Bespoke Brochure Generated' : 'Request Bespoke Brochure'}
              </h2>
              <p className="text-xs text-neutral-400 font-mono mt-0.5">
                Official Apex Forged technical dossier & quotation for BMW M
              </p>
            </div>
          </div>

          <button
            onClick={handleReset}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        {!isSubmitted ? (
          /* FORM VIEW */
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Active Spec Summary banner */}
            <div className="bg-neutral-950 rounded-xl p-3.5 border border-white/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{car.name}</span>
                <span className="text-neutral-600">•</span>
                <span className="text-neutral-300">{paint.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#FF5500] font-bold">{wheel.name}</span>
                <span className="text-neutral-400">({finish.name})</span>
                <span className="bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 text-[11px] font-bold">
                  -{wheel.weightSavingsKg * 4}kg
                </span>
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-mono">
                  <User className="w-3.5 h-3.5 text-[#FF5500]" />
                  First Name <span className="text-[#FF5500]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Marcus"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-neutral-950 border border-white/[0.12] focus:border-[#FF5500] rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-[#FF5500] transition-all font-sans"
                />
              </div>

              {/* Surname */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-mono">
                  <User className="w-3.5 h-3.5 text-[#FF5500]" />
                  Surname <span className="text-[#FF5500]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vance"
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  className="w-full bg-neutral-950 border border-white/[0.12] focus:border-[#FF5500] rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-[#FF5500] transition-all font-sans"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-mono">
                  <Mail className="w-3.5 h-3.5 text-[#FF5500]" />
                  Email Address <span className="text-[#FF5500]">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-neutral-950 border border-white/[0.12] focus:border-[#FF5500] rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-[#FF5500] transition-all font-sans"
                />
              </div>

              {/* Cell Number */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-mono">
                  <Phone className="w-3.5 h-3.5 text-[#FF5500]" />
                  Cell / Mobile Number <span className="text-[#FF5500]">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+1 (555) 000-0000"
                  value={cellNumber}
                  onChange={(e) => setCellNumber(e.target.value)}
                  className="w-full bg-neutral-950 border border-white/[0.12] focus:border-[#FF5500] rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-[#FF5500] transition-all font-sans"
                />
              </div>
            </div>

            {/* Additional Notes / Fitment query */}
            <div>
              <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider mb-1.5 font-mono">
                BMW Model Year / VIN / Special Requests (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. 2024 BMW M4 Competition xDrive with CCB brakes. Track alignment preferences..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-neutral-950 border border-white/[0.12] focus:border-[#FF5500] rounded-xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-[#FF5500] transition-all font-sans"
              />
            </div>

            {/* Checkbox consultation */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={requestConsultation}
                onChange={(e) => setRequestConsultation(e.target.checked)}
                className="mt-0.5 rounded border-white/[0.2] text-[#FF5500] focus:ring-[#FF5500] bg-neutral-950"
              />
              <span className="text-xs text-neutral-300 leading-relaxed font-sans">
                Connect me with an Apex Forged senior BMW fitment engineer to verify custom wheel offsets, track width clearance, and brake disc spacing.
              </span>
            </label>

            {/* Submit CTA */}
            <div className="pt-2 flex items-center justify-end gap-3 font-mono">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 bg-[#FF5500] hover:bg-[#FF6600] active:scale-[0.99] text-black font-bold px-6 py-2.5 rounded-xl text-xs tracking-wide shadow-[0_0_20px_rgba(255,85,0,0.35)] transition-all font-mono"
              >
                <span>Submit & Download Brochure</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </form>
        ) : (
          /* THANK YOU RESPONSE & BROCHURE DOSSIER */
          <div className="p-6 md:p-8 space-y-6 animate-fadeIn">
            {/* Thank You Header */}
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h3 className="text-xl md:text-2xl font-black text-white tracking-tight">
                Thank You, {submittedLead?.name} {submittedLead?.surname}!
              </h3>
              <p className="text-sm text-neutral-300 max-w-lg mx-auto leading-relaxed">
                Your bespoke configuration for the <strong className="text-white">{car.name}</strong> has been logged. Our engineering team has dispatched your high-resolution digital brochure to <span className="text-[#FF5500] font-mono font-medium">{submittedLead?.email}</span> and will follow up at <span className="text-[#FF5500] font-mono font-medium">{submittedLead?.cellNumber}</span>.
              </p>
            </div>

            {/* Digital Spec Sheet Certificate Card (Printable) */}
            <div className="bg-black border border-white/[0.12] border-t-2 border-t-[#FF5500] rounded-2xl p-5 shadow-2xl relative overflow-hidden print:border-black print:text-black">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#FF5500] font-bold">
                    CERTIFICATE OF FITMENT SPECIFICATION
                  </span>
                  <div className="text-white font-extrabold text-base tracking-wide font-mono">
                    APEX FORGED BESPOKE BMW M BUILD
                  </div>
                </div>
                <div className="text-right font-mono text-[10px] text-neutral-400">
                  REF: {submittedLead?.id.toUpperCase()}
                </div>
              </div>

              {/* Spec Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                <div className="bg-neutral-950 p-2.5 rounded-lg border border-white/[0.08]">
                  <span className="text-neutral-400 block text-[9px] uppercase">Vehicle Chassis</span>
                  <span className="text-white font-bold">{car.name}</span>
                  <span className="text-neutral-400 text-[9px] block">{car.power}</span>
                </div>

                <div className="bg-neutral-950 p-2.5 rounded-lg border border-white/[0.08]">
                  <span className="text-neutral-400 block text-[9px] uppercase">Exterior Paint</span>
                  <span className="text-white font-bold">{paint.name}</span>
                  <span className="text-neutral-400 text-[9px] block">Code: {paint.code}</span>
                </div>

                <div className="bg-neutral-950 p-2.5 rounded-lg border border-white/[0.08]">
                  <span className="text-neutral-400 block text-[9px] uppercase">Wheel Model</span>
                  <span className="text-[#FF5500] font-bold">{wheel.name}</span>
                  <span className="text-neutral-400 text-[9px] block">{wheel.code}</span>
                </div>

                <div className="bg-neutral-950 p-2.5 rounded-lg border border-white/[0.08]">
                  <span className="text-neutral-400 block text-[9px] uppercase">Selected Finish</span>
                  <span className="text-white font-bold">{finish.name}</span>
                  <span className="text-neutral-400 text-[9px] block">{finish.badge}</span>
                </div>

                <div className="bg-neutral-950 p-2.5 rounded-lg border border-white/[0.08]">
                  <span className="text-neutral-400 block text-[9px] uppercase">Wheel Stagger</span>
                  <span className="text-white font-mono font-bold">{wheelSize} Forged</span>
                  <span className="text-neutral-400 text-[9px] block">{car.recommendedWheelFitment.pcd}</span>
                </div>

                <div className="bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/30">
                  <span className="text-emerald-400 block text-[9px] uppercase font-bold">Unsprung Saved</span>
                  <span className="text-emerald-400 font-mono font-black text-sm">
                    -{(wheel.weightSavingsKg * 4).toFixed(1)} kg
                  </span>
                  <span className="text-neutral-300 text-[9px] block">4-Axle Total</span>
                </div>
              </div>

              {/* Warranty & Guarantee footer badge */}
              <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-neutral-400 font-mono">
                <span className="flex items-center gap-1.5 text-neutral-300">
                  <ShieldCheck className="w-4 h-4 text-[#FF5500]" />
                  Lifetime Structural Warranty • 6061-T6 Forged Monoblock
                </span>
                <span className="font-mono text-[#FF5500] font-bold">
                  Est: ${price.toLocaleString()} USD
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 font-mono">
              <button
                onClick={handlePrintBrochure}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-neutral-950 hover:bg-neutral-900 text-white border border-white/[0.12] px-5 py-2.5 rounded-xl text-xs font-semibold transition-all"
              >
                <Printer className="w-4 h-4 text-[#FF5500]" />
                <span>Print / Save PDF</span>
              </button>

              <button
                onClick={handleReset}
                className="w-full sm:w-auto bg-[#FF5500] hover:bg-[#FF6600] text-black font-bold px-6 py-2.5 rounded-xl text-xs transition-all shadow-[0_0_20px_rgba(255,85,0,0.35)]"
              >
                Return to 3D Studio
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
