import React from "react";
import { useLocation } from "react-router-dom";
import { useReportNames } from "@/api/reportNames";
import { reportKeyForPath } from "@/config/reportCatalog";

/**
 * The heading of the report currently open: the name an admin gave it, or the
 * `fallback` the page passes in — its own translated title.
 *
 * A component rather than a hook so a report page can drop it straight into
 * its existing `<Typography>` without worrying about where its early returns
 * sit; a hook called inside JSX after a conditional return would break the
 * rules of hooks.
 */
const ReportTitle: React.FC<{ fallback: string }> = ({ fallback }) => {
  const location = useLocation();
  const { data: names } = useReportNames();
  const key = reportKeyForPath(location.pathname);
  return <>{(key && names?.get(key)) || fallback}</>;
};

export default ReportTitle;
