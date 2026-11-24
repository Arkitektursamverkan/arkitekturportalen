import React from "react";
import { Alert, Link, Stack } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import { useNavigate } from "react-router-dom";
import { addDays, occurrenceEnd, shortDate, timeLabel, toIsoDate, useCalendarEvents } from "@/api/calendar";

/** Hur långt fram startsidan varnar för verksamhetskritiska händelser: dagen innan och samma dag. */
const DAYS_AHEAD = 1;

/**
 * Fastställda verksamhetskritiska händelser i dag och i morgon (och de som pågår) – det den
 * som planerar en ändring behöver se först. Förslag varnar inte.
 */
const FreezeNotice: React.FC = () => {
  const navigate = useNavigate();
  const today = toIsoDate(new Date());
  const tomorrow = toIsoDate(addDays(new Date(), 1));
  const { data: events = [] } = useCalendarEvents(today, toIsoDate(addDays(new Date(), DAYS_AHEAD)));

  const freezes = events
    .filter((e) => e.change_freeze && e.status === "approved")
    .flatMap((event) => event.occurrences.map((date) => ({ date, event })))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.event.start_time ?? "").localeCompare(b.event.start_time ?? ""));
  if (freezes.length === 0) return null;

  return (
    <Stack spacing={1} sx={{ mb: 3 }}>
      {freezes.map(({ date, event }) => {
        const needs = [...event.nodes.filter((n) => n.type !== "Process").map((n) => n.name), event.other_dependencies]
          .filter(Boolean)
          .join(", ");
        const end = occurrenceEnd(date, event);
        // En flerdagshändelse kan ha börjat tidigare och pågå än.
        const ongoing = date <= today;
        const when = ongoing
          ? end > today ? `pågår t.o.m. ${shortDate(end)}` : "i dag"
          : date === tomorrow ? "i morgon" : shortDate(date);
        return (
          <Alert key={`${event.id}-${date}`} severity={ongoing ? "error" : "warning"} icon={<LockIcon />}>
            <strong>Verksamhetskritiskt {when}</strong> ({timeLabel(event).toLowerCase()}):{" "}
            <Link component="button" underline="hover" color="inherit" sx={{ verticalAlign: "baseline", fontWeight: 600 }}
              onClick={() => navigate(`/business-calendar?id=${event.id}`)}>
              {event.title}
            </Link>
            {needs && ` – berör ${needs}`}
          </Alert>
        );
      })}
    </Stack>
  );
};

export default FreezeNotice;
