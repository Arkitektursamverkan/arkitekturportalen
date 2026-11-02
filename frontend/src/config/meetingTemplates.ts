/**
 * Templates for meeting notes inside an uppdrag. A template only seeds the
 * body when the notes are created — afterwards it is ordinary text, edited
 * like any other page. The key is stored on the meeting so the list can show
 * what kind of meeting it was.
 *
 * The bodies use only what MarkdownView renders: headings, lists and quotes.
 */
export interface MeetingTemplate {
  key: string;
  label: string;
  description: string;
  body: string;
}

const ATTENDEES = `## Deltagare

- 

## Frånvarande

- 
`;

export const MEETING_TEMPLATES: MeetingTemplate[] = [
  {
    key: "status",
    label: "Avstämning",
    description: "Återkommande statusmöte: läget sedan sist, hinder, beslut och åtgärder.",
    body: `${ATTENDEES}
## Status sedan förra mötet

- 

## Hinder och risker

- 

## Beslut

- 

## Åtgärder

- Vad · Ansvarig · Klart senast

## Nästa möte

- Datum: 
`,
  },
  {
    key: "kickoff",
    label: "Uppstartsmöte",
    description: "Startar ett uppdrag: syfte, omfattning, roller, tidplan och arbetssätt.",
    body: `${ATTENDEES}
## Syfte och mål

- 

## Omfattning

**Ingår:**

- 

**Ingår inte:**

- 

## Roller och ansvar

- Namn · Roll · Ansvar

## Tidplan och milstolpar

- 

## Arbetssätt

- Mötesfrekvens: 
- Var dokumentationen finns: det här uppdraget i portalen

## Åtgärder

- Vad · Ansvarig · Klart senast
`,
  },
  {
    key: "workshop",
    label: "Workshop",
    description: "Arbetsmöte med frågeställning, underlag, resultat och slutsatser.",
    body: `${ATTENDEES}
## Frågeställning

> 

## Underlag

- 

## Genomgång

- 

## Resultat

- 

## Slutsatser

- 

## Åtgärder

- Vad · Ansvarig · Klart senast
`,
  },
  {
    key: "decision",
    label: "Beslutsmöte",
    description: "Underlag, alternativ, rekommendation och fattat beslut med motivering.",
    body: `${ATTENDEES}
## Bakgrund

- 

## Alternativ

**Alternativ 1 —**

- Fördelar: 
- Nackdelar: 

**Alternativ 2 —**

- Fördelar: 
- Nackdelar: 

## Rekommendation

- 

## Beslut

> 

**Motivering:**

- 

**Beslutet fattat av:** 

## Åtgärder

- Vad · Ansvarig · Klart senast
`,
  },
  {
    key: "inventory",
    label: "Inventeringsintervju",
    description:
      "Intervju om ett system eller en verksamhet: ägarskap, processer, information, integrationer och teknik.",
    body: `## Intervjuad

- Namn · Roll · Verksamhet

## Objekt som intervjun gäller

- 

## Verksamhet

- Vilka processer stödjer objektet?
- Vilka använder det, och hur många?

## Information

- Vilken information hanteras?
- Personuppgifter?
- Var lagras informationen?

## Applikation

- Systemägare och systemförvaltare:
- Leverantör och avtal:
- Livscykel (nytt · förvaltas · avvecklas):

## Teknik

- Driftform (moln · lokalt · hybrid):
- Inloggning (SSO · lokalt konto):
- Integrationer till och från:

## Iakttagelser

- 

## Att följa upp

- Vad · Ansvarig · Klart senast
`,
  },
  {
    key: "blank",
    label: "Tom mall",
    description: "Bara deltagare och anteckningar — skriv fritt.",
    body: `${ATTENDEES}
## Anteckningar

- 
`,
  },
];

const BY_KEY = new Map(MEETING_TEMPLATES.map((t) => [t.key, t]));

export function meetingTemplateLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? "Möte";
}
