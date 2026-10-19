import React, { useEffect, useRef } from "react";
import { useCurrentUser } from "@/api/me";
import { useRoleStore } from "@/store/roleStore";
import { useRandomSurveyStore } from "@/store/randomSurveyStore";
import { useRecordSession } from "@/api/statistics";
import { useRandomSurveyCheck } from "@/api/mySurveys";
import { useModules } from "@/api/orgSettings";

const LAST_SESSION_KEY = "ea_last_session_ts";
const SESSION_COOLDOWN_MS = 8 * 60 * 60 * 1000; // 8 hours — one login per person per day

/**
 * Fetches the current user from the backend and pushes name/role into
 * the in-memory Zustand store so the rest of the app can read it via
 * useRoleStore() without each component making its own /me call.
 *
 * Also records one anonymous session event per ~8-hour window so that
 * usage statistics can track daily active sessions without double-counting
 * multiple tabs or page reloads.
 */
const UserSync: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data } = useCurrentUser();
  const setUser = useRoleStore((s) => s.setUser);
  const setRandomSurveyOffer = useRandomSurveyStore((s) => s.setOffer);
  const recordSession = useRecordSession();
  const randomSurveyCheck = useRandomSurveyCheck();
  const modules = useModules();
  const recorded = useRef(false);

  useEffect(() => {
    if (data) {
      setUser({ id: data.id, role: data.role, name: data.name, email: data.email, access: data.access, typeAccess: data.type_access });

      if (!recorded.current) {
        recorded.current = true;
        const last = Number(localStorage.getItem(LAST_SESSION_KEY) ?? "0");
        if (Date.now() - last > SESSION_COOLDOWN_MS) {
          localStorage.setItem(LAST_SESSION_KEY, String(Date.now()));
          recordSession.mutate();
          // Same once-per-login-session gate rolls the slumpenkät dice —
          // the backend decides (on average every 3rd session) whether to
          // offer a randomly picked system to answer about.
          // Not while Enkäter is known to be off (if the settings have not
          // loaded yet, the API's 404 is swallowed below).
          if (!modules.ready || modules.enabled("surveys")) randomSurveyCheck
            .mutateAsync()
            .then((offer) => {
              if (offer) setRandomSurveyOffer(offer);
            })
            .catch(() => {});
        }
      }
    }
  }, [data, setUser]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
};

export default UserSync;
