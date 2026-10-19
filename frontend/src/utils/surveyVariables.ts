// Merge-field variables admins can reference in question text (label/help
// text) while authoring a survey. Written as `{{token}}`, resolved per
// respondent when the survey is rendered (e.g. `{{system_name}}` becomes the
// name of the system that particular response is about).

export interface SurveyVariable {
  token: string;
  label: string;
}

// The {{system_name}} token always resolves to the response's node name,
// whatever type of object the survey targets — only the label shown in the
// @ picker changes, so an admin authoring a Process survey sees "Processens
// namn" instead of a misleading "Systemets namn".
const OBJECT_NAME_LABEL: Record<string, string> = {
  Application: "Applikationens namn",
  Process: "Processens namn",
  InformationObject: "Informationsobjektets namn",
  InformationSource: "Informationskällans namn",
  TechnologyComponent: "Teknikkomponentens namn",
  Server: "Serverns namn",
};

export function getSurveyVariables(targetNodeType: string): SurveyVariable[] {
  return [
    { token: "system_name", label: OBJECT_NAME_LABEL[targetNodeType] ?? "Objektets namn" },
  ];
}

export function variablePlaceholder(token: string): string {
  return `{{${token}}}`;
}

export function renderSurveyText(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}
