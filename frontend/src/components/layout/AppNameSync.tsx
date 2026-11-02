import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePublicOrgSettings } from "@/api/orgSettings";
import { setAppName } from "@/i18n";

/**
 * What an admin named the portal (Administration → Organisation), or the standard
 * name in the user's language: reaches every text through {{appName}}, and the
 * browser tab. Mounted outside the sign-in, since the login page shows the name.
 */
export default function AppNameSync() {
  const { t } = useTranslation();
  const { data, isLoading } = usePublicOrgSettings();
  const standard = t("app.defaultName");
  // Until the translations have loaded t() answers with the key.
  const name = data?.app_name || (standard === "app.defaultName" ? "" : standard);

  useEffect(() => {
    if (isLoading || !name) return;
    setAppName(name);
    document.title = name;
  }, [name, isLoading]);

  return null;
}
