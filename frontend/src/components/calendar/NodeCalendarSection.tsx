import React from "react";
import { Box, Divider, Stack, Tooltip, Typography } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import EventIcon from "@mui/icons-material/Event";
import { useNavigate } from "react-router-dom";
import { recurrenceLabel, shortDate, spanLabel, timeLabel, toIsoDate, useNodeCalendarEvents } from "@/api/calendar";

/**
 * Verksamhetshändelser som objektet är kritiskt för – så att den som tänker
 * ändra i objektet ser när det inte får röras. Visas bara när det finns några.
 */
const NodeCalendarSection: React.FC<{ nodeId: string; nodeType: string }> = ({ nodeId, nodeType }) => {
  const navigate = useNavigate();
  const { data: events = [] } = useNodeCalendarEvents(nodeId);
  const today = toIsoDate(new Date());
  if (events.length === 0) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Divider sx={{ mb: 1 }} />
      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, display: "block", mb: 0.5 }}>
        {nodeType === "Process" ? "Verksamhetshändelser" : "Kritisk för"}
      </Typography>
      <Stack spacing={0.75}>
        {events.map((e) => (
          <Box
            key={e.id}
            onClick={() => navigate(`/business-calendar?id=${e.id}`)}
            sx={{ cursor: "pointer", borderRadius: 1, px: 0.5, mx: -0.5, "&:hover": { bgcolor: "action.hover" } }}
          >
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              {e.change_freeze ? (
                <Tooltip title="Verksamhetskritiskt medan händelsen pågår">
                  <LockIcon sx={{ fontSize: 14, color: "error.main" }} />
                </Tooltip>
              ) : (
                <EventIcon sx={{ fontSize: 14, color: "text.secondary" }} />
              )}
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {e.title}{e.status === "proposed" && " (förslag)"}
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", pl: 2.25 }}>
              {e.recurrence === "once" ? spanLabel(e.start_date, e) : recurrenceLabel(e.recurrence, e.start_date)} · {timeLabel(e)}
              {e.recurrence !== "once" && e.occurrences[0] &&
                (e.occurrences[0] <= today ? " · pågår nu" : ` · nästa ${shortDate(e.occurrences[0])}`)}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

export default NodeCalendarSection;
