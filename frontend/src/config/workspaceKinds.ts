import type { WorkspaceKind } from "@/api/workspaces";

/**
 * The two kinds of Samarbete-ytor share every screen; only the words differ.
 * An uppdrag has medlemmar, an arbetsgrupp has deltagare — same member rows
 * underneath, so this is wording, not a second permission model.
 */
export interface KindCopy {
  /** Sidebar and list heading. */
  listTitle: string;
  listPath: string;
  listIntro: string;
  /** "ett uppdrag" / "en arbetsgrupp" — indefinite, lowercase. */
  noun: string;
  /** "uppdraget" / "arbetsgruppen" — definite, lowercase. */
  definite: string;
  createLabel: string;
  /** Tab label and heading for the member list. */
  membersLabel: string;
  /** "medlemmar" / "deltagare" — lowercase plural, for running text. */
  membersNoun: string;
  addMemberLabel: string;
  emptyText: string;
}

export const KIND_COPY: Record<WorkspaceKind, KindCopy> = {
  uppdrag: {
    listTitle: "Uppdrag",
    listPath: "/uppdrag",
    listIntro:
      "Egna ytor för uppdrag och projekt — instruktioner, filer, diskussion och uppgifter, " +
      "med egen medlemslista.",
    noun: "uppdrag",
    definite: "uppdraget",
    createLabel: "Nytt uppdrag",
    membersLabel: "Medlemmar",
    membersNoun: "medlemmar",
    addMemberLabel: "Lägg till medlem",
    emptyText: "Du är inte med i något uppdrag ännu.",
  },
  arbetsgrupp: {
    listTitle: "Arbetsgrupper",
    listPath: "/arbetsgrupper",
    listIntro:
      "Stående arbetsgrupper. Alla inloggade kan läsa; gruppens deltagare skriver " +
      "sidor, mötesanteckningar, kalender, filer, diskussion och uppgifter.",
    noun: "arbetsgrupp",
    definite: "arbetsgruppen",
    createLabel: "Ny arbetsgrupp",
    membersLabel: "Deltagare",
    membersNoun: "deltagare",
    addMemberLabel: "Lägg till deltagare",
    emptyText: "Inga arbetsgrupper ännu.",
  },
};

export function kindCopy(kind: WorkspaceKind | undefined): KindCopy {
  return KIND_COPY[kind ?? "uppdrag"];
}
