import { create } from "zustand";
import type { SurveyResponseSummary } from "@/api/surveys";

interface RandomSurveyState {
  offer: SurveyResponseSummary | null;
  setOffer: (offer: SurveyResponseSummary) => void;
  clearOffer: () => void;
}

/**
 * In-memory bridge for the random-survey ("slumpenkät") offer. UserSync
 * (mounted outside the router) does the login-session roll against the
 * backend and stores the result here; RandomSurveyDialog inside AppShell
 * reads it and can navigate. Not persisted — a postponed offer lives on as
 * a pending response in the database (hidden from Mina enkäter) that a later
 * login roll can re-offer, not in this store.
 */
export const useRandomSurveyStore = create<RandomSurveyState>()((set) => ({
  offer: null,
  setOffer: (offer) => set({ offer }),
  clearOffer: () => set({ offer: null }),
}));
