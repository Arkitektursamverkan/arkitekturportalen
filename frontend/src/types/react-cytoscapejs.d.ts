declare module "react-cytoscapejs" {
  import type { Core, ElementDefinition, LayoutOptions, Stylesheet } from "cytoscape";
  import type React from "react";

  interface CytoscapeComponentProps {
    elements: ElementDefinition[];
    stylesheet?: Stylesheet[] | object[];
    layout?: LayoutOptions;
    style?: React.CSSProperties;
    cy?: (cy: Core) => void;
    [key: string]: unknown;
  }

  const CytoscapeComponent: React.FC<CytoscapeComponentProps>;
  export default CytoscapeComponent;
}
