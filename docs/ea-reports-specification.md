# EA Application — Report Specification

## Summary Overview

| # | Report Name | Category | Format | Key Users |
|---|---|---|---|---|
| 1.1 | EA Maturity Dashboard | Strategy & Governance | Dashboard / KPIs | CIO, EA Lead |
| 1.2 | Strategic Roadmap | Strategy & Governance | Timeline / Gantt | CIO, Strategist |
| 1.3 | Capability–Application Matrix | Strategy & Governance | Matrix / Heatmap | CIO, Business Architect |
| 2.1 | Process–Application Support Map | Process Architecture | Matrix | Process Owner, Business Architect |
| 2.2 | Process Automation Potential | Process Architecture | Scored list | Process Owner, CDO |
| 2.3 | Process Dependency Chain | Process Architecture | Graph / Tree | Process Owner, Risk Manager |
| 3.1 | Information Object Ownership Report | Information & Data | List / Matrix | Data Owner, CDO |
| 3.2 | Data Classification Matrix | Information & Data | Matrix / Heatmap | CISO, Data Owner |
| 3.3 | Information Flow Diagram | Information & Data | Sankey / Graph | Data Architect, CISO |
| 4.1 | Application Portfolio Overview | Application Architecture | Dashboard / List | CIO, App Owner |
| 4.2 | Application Redundancy Report | Application Architecture | Matrix / List | CIO, EA Lead |
| 4.3 | Application–Owner Accountability Matrix | Application Architecture | Matrix | CIO, Line Manager |
| 4.4 | Application Technology Stack Report | Application Architecture | Grouped list | CTO, Infra Lead |
| 5.1 | Integration Map | Integration Architecture | Graph / Matrix | Integration Architect |
| 5.2 | Integration Point-of-Failure Analysis | Integration Architecture | List / Heatmap | Integration Architect, Risk Manager |
| 5.3 | API/Integration Inventory | Integration Architecture | List | Integration Architect, Developer |
| 6.1 | Technology Component Inventory | Infrastructure | List / Dashboard | Infra Lead, CTO |
| 6.2 | Hosting & Deployment Map | Infrastructure | Matrix / List | Infra Lead, CISO |
| 6.3 | Technology Debt Heatmap | Infrastructure | Heatmap | CTO, EA Lead |
| 7.1 | NIS2 Compliance Coverage Report | Security & Compliance | Matrix / Checklist | CISO, Compliance Officer |
| 7.2 | GDPR Data Processing Register | Security & Compliance | List / Matrix | DPO, Legal |
| 7.3 | Risk Register — Application Risk Scorecard | Security & Compliance | Heatmap / List | CISO, Risk Manager |
| 7.4 | Business Criticality Impact Analysis (BIA) | Security & Compliance | Matrix / Heatmap | CISO, Continuity Manager |
| 7.5 | Access & Authentication Landscape | Security & Compliance | Matrix | CISO, IT Security |
| 8.1 | Application Lifecycle Status Report | Portfolio & Lifecycle | List / Dashboard | CIO, App Owner |
| 8.2 | Sunset & Migration Plan | Portfolio & Lifecycle | Timeline / List | CIO, Project Manager |
| 8.3 | Cost Allocation per Application | Portfolio & Lifecycle | List / Chart | CFO, CIO |
| 8.4 | Vendor Dependency Report | Portfolio & Lifecycle | Grouped list / Chart | CIO, Procurement |

---

## 1. Strategy & Governance

### 1.1 EA Maturity Dashboard

**Purpose:** Provide a high-level view of how complete and well-governed the EA model is. Answers: "How much of the organization is mapped? Where are the blind spots?"

**Primary users:** CIO, EA Lead, IT Governance Board

**Required data sources:**
- All node types (Process, Application, InformationObject, InformationSource, TechnologyComponent)
- All edge types (SUPPORTS, HANDLES, REALIZES, RUNS_ON, INTEGRATES_WITH, CONTAINS, USES)
- Node attributes: `status`, `external_source`, `description`, `archived`

**Metrics to display:**
- Total nodes per type (with trend over time if audit log data is available)
- Percentage of applications with at least one SUPPORTS edge to a process
- Percentage of processes with at least one supporting application
- Percentage of information objects with at least one REALIZES edge to an information source
- Percentage of nodes with a description filled in
- Number of orphaned nodes (no edges at all)
- Overlap count and gap count (from existing analysis)

**Format:** Dashboard with KPI cards, bar charts, completeness gauges

**Filters:** By department (avdelning), by external source, by date range

---

### 1.2 Strategic Roadmap

**Purpose:** Visualize planned changes to the application landscape over time. Supports investment decisions and migration planning.

**Primary users:** CIO, IT Strategist, Enterprise Architect

**Required data sources:**
- Applications with attributes: `status` (Active, Planned, Phase-out, Retired), `planned_retirement_date`, `planned_go_live_date`
- Technology Components with `end_of_life` or `end_of_support` dates
- INTEGRATES_WITH edges (to show integration impact of changes)

**Format:** Timeline / swim-lane diagram grouped by department or category

**Filters:** By status, by department, by date range, by category

**Note:** Requires new attributes: `planned_retirement_date`, `planned_go_live_date` on Application nodes.

---

### 1.3 Capability–Application Matrix

**Purpose:** Show which business capabilities (processes) are supported by which applications, highlighting gaps and overlaps at a glance.

**Primary users:** CIO, Business Architect, Process Owner

**Required data sources:**
- Processes (top-level only, or selectable depth)
- Applications
- SUPPORTS edges

**Format:** Matrix/heatmap — processes as rows, applications as columns. Cell color = number of support relationships. Empty cells = gaps. Dark cells = potential redundancy.

**Filters:** By process category, by department, by application status

---

## 2. Process Architecture

### 2.1 Process–Application Support Map

**Purpose:** For each business process, show which applications support it and how. Identifies processes with no application support (gaps) and processes with multiple applications (overlaps/redundancy).

**Primary users:** Process Owner, Business Architect, CIO

**Required data sources:**
- Processes (with hierarchy)
- Applications
- SUPPORTS edges
- Application attributes: `status`, `driftform`, `avdelning`

**Format:** Expandable tree/matrix — process hierarchy on the left, supporting applications on the right. Color-coded: green (1 app), yellow (2+ apps = overlap), red (0 apps = gap).

**Filters:** By process level (depth), by department, by application status

---

### 2.2 Process Automation Potential

**Purpose:** Identify processes suitable for automation or digitalization. Supports digital transformation planning.

**Primary users:** Process Owner, CDO, IT Strategist

**Required data sources:**
- Processes with attributes: `frekvens` (frequency), `ägare` (owner), `kategori` (category)
- SUPPORTS edges (count of supporting apps)
- Information objects handled (via HANDLES edges from supporting apps)

**Scoring model:**
- High frequency + low app support = high automation potential
- Manual-heavy processes (no supporting apps) = digitalization candidates

**Format:** Scored/ranked list with automation potential indicator

**Filters:** By department, by frequency, by category

---

### 2.3 Process Dependency Chain

**Purpose:** Trace dependencies across the full process chain: Process → Application → Information Object → Information Source → Technology Component. Answers: "If this process breaks, what is affected?"

**Primary users:** Process Owner, Risk Manager, Business Continuity

**Required data sources:**
- All node types
- All edge types (full E2E chain)

**Format:** Interactive graph (already partially implemented as Process E2E view). Report version should be exportable as PDF/image.

**Filters:** Select a process, depth of chain

---

## 3. Information & Data Architecture

### 3.1 Information Object Ownership Report

**Purpose:** Show who owns each information object and which applications handle it. Supports data governance and accountability.

**Primary users:** Data Owner, CDO, Data Architect

**Required data sources:**
- Information Objects with attributes: `data_owner`, `definition`, `domain`
- Applications (via HANDLES edges)
- Information Sources (via REALIZES edges)

**Format:** List/table grouped by owner or domain. Each row: information object, owner, handling applications, realizing sources.

**Filters:** By owner, by domain, by application

---

### 3.2 Data Classification Matrix

**Purpose:** Show the classification/sensitivity level of information objects and which applications handle them. Critical for security and compliance.

**Primary users:** CISO, Data Owner, Compliance Officer

**Required data sources:**
- Information Objects with attribute: `klassificering` (classification level, e.g. Öppen, Intern, Konfidentiell, Hemlig)
- Applications (via HANDLES edges)
- Information Sources with attribute: `classification`

**Format:** Matrix — information objects as rows, applications as columns. Cell color = classification level. Heatmap style: red = highly classified data in many systems.

**Filters:** By classification level, by application, by department

**Note:** Requires `klassificering` attribute on InformationObject (already partially exists).

---

### 3.3 Information Flow Diagram

**Purpose:** Visualize how information moves between applications, information objects, and information sources. Supports data lineage and impact analysis.

**Primary users:** Data Architect, CISO, Integration Architect

**Required data sources:**
- Applications, Information Objects, Information Sources
- HANDLES, REALIZES, INTEGRATES_WITH, CONTAINS edges

**Format:** Sankey diagram or directed graph showing data flow from sources through applications to information objects.

**Filters:** Select an information object and trace all sources/consumers, or select an application and trace all information it handles.

---

## 4. Application & System Architecture

### 4.1 Application Portfolio Overview

**Purpose:** A comprehensive list of all applications with key metadata. The single source of truth for the application landscape.

**Primary users:** CIO, Application Owner, IT Governance

**Required data sources:**
- Applications with all attributes: `status`, `kategori`, `driftform`, `avdelning`, `systemägare`, `systemförvaltare`, `leverantör`
- Edge counts: number of processes supported, info objects handled, integrations

**Format:** Sortable/filterable table with export to CSV/Excel. Summary statistics at the top.

**Filters:** By status, by category, by department, by hosting model, by vendor

---

### 4.2 Application Redundancy Report

**Purpose:** Identify applications that serve the same purpose — supporting the same processes or handling the same information objects. Supports rationalization and cost reduction.

**Primary users:** CIO, EA Lead, CFO

**Required data sources:**
- Applications
- SUPPORTS edges (which processes each app supports)
- HANDLES edges (which info objects each app handles)
- Already partially available via Overlap & Gaps analysis

**Format:** Grouped list — each group is a set of applications supporting the same process(es). Overlap score = number of shared processes.

**Filters:** Minimum overlap threshold, by department, by category

---

### 4.3 Application–Owner Accountability Matrix

**Purpose:** Show which applications each department/person is responsible for. Supports governance and ensures no application is unowned.

**Primary users:** CIO, Line Managers, IT Governance

**Required data sources:**
- Applications with attributes: `systemägare`, `systemförvaltare`, `systemadministratör`, `avdelning`

**Format:** Matrix — departments/owners as rows, applications as columns. Or grouped list by owner.

**Filters:** By department, by role (ägare/förvaltare/admin), show unowned apps

---

### 4.4 Application Technology Stack Report

**Purpose:** Show which technology components each application runs on. Supports infrastructure planning and risk assessment (e.g. single technology dependency).

**Primary users:** CTO, Infrastructure Lead, Security Officer

**Required data sources:**
- Applications
- Technology Components
- RUNS_ON edges

**Format:** Grouped list — applications grouped by technology component. Or matrix view.

**Filters:** By technology type, by hosting model, by application status

---

## 5. Integration Architecture

### 5.1 Integration Map

**Purpose:** Visualize all integrations between applications. The big picture of how systems talk to each other.

**Primary users:** Integration Architect, CTO, Developer

**Required data sources:**
- Applications
- INTEGRATES_WITH edges (with attributes if available: protocol, frequency, direction)

**Format:** Network graph (already implemented as Landscape view). Report version should include a table listing all integration pairs.

**Filters:** By department, by application, by integration type/protocol

---

### 5.2 Integration Point-of-Failure Analysis

**Purpose:** Identify single points of failure in the integration landscape — applications that many others depend on. If that app goes down, what breaks?

**Primary users:** Integration Architect, Risk Manager, Operations

**Required data sources:**
- Applications
- INTEGRATES_WITH edges
- SUPPORTS edges (to link to business impact)

**Metrics:**
- Integration degree (number of INTEGRATES_WITH edges per application)
- Business criticality (number of processes indirectly dependent)
- Hub score = integration degree × business criticality

**Format:** Ranked list / heatmap. Top-N most critical integration hubs.

**Filters:** Minimum integration degree, by department

---

### 5.3 API/Integration Inventory

**Purpose:** List all integration points with technical details. Supports migration planning and documentation.

**Primary users:** Integration Architect, Developer, Project Manager

**Required data sources:**
- INTEGRATES_WITH edges with attributes: `protocol`, `direction`, `frequency`, `description`
- Source and target applications

**Format:** Filterable table. Each row = one integration with source, target, protocol, direction, description.

**Filters:** By protocol, by application, by direction

**Note:** Requires enriched attributes on INTEGRATES_WITH edges.

---

## 6. Infrastructure & Technical Architecture

### 6.1 Technology Component Inventory

**Purpose:** A complete inventory of all technology components (servers, platforms, frameworks, databases) in use.

**Primary users:** Infrastructure Lead, CTO, Procurement

**Required data sources:**
- Technology Components with attributes: `komponenttyp`, `leverantör`, `hosting`, `plattform`, `version`, `end_of_support`
- RUNS_ON edges (which apps use this component)

**Format:** Sortable table with summary statistics. Grouped by component type.

**Filters:** By type, by vendor, by hosting model

---

### 6.2 Hosting & Deployment Map

**Purpose:** Show where each application is hosted and deployed. Supports cloud migration planning and compliance (data residency).

**Primary users:** Infrastructure Lead, CISO, Cloud Architect

**Required data sources:**
- Applications with attribute: `driftform` (on-prem, cloud, SaaS, hybrid)
- Technology Components with attribute: `hosting`
- RUNS_ON edges

**Format:** Matrix or grouped list — applications grouped by hosting model. Pie chart showing distribution.

**Filters:** By hosting model, by department, by vendor

---

### 6.3 Technology Debt Heatmap

**Purpose:** Identify outdated technology components approaching or past end-of-life. Prioritize modernization efforts.

**Primary users:** CTO, EA Lead, Risk Manager

**Required data sources:**
- Technology Components with attributes: `version`, `end_of_support`, `end_of_life`
- RUNS_ON edges (impact = number of apps dependent)

**Scoring:**
- Red: past end-of-life
- Orange: within 12 months of end-of-support
- Yellow: within 24 months
- Green: supported

**Format:** Heatmap / traffic-light list. Sorted by impact (number of dependent apps).

**Filters:** By component type, by vendor, minimum impact threshold

**Note:** Requires new attributes: `end_of_support`, `end_of_life` on TechnologyComponent.

---

## 7. Security, Risk & Compliance

### 7.1 NIS2 Compliance Coverage Report

**Purpose:** Map the organization's EA to NIS2 requirements. Show which critical processes and systems are covered by security measures, and where gaps exist.

**Primary users:** CISO, Compliance Officer, Risk Manager

**Required data sources:**
- Processes marked as `essential` or `important` (NIS2 classification)
- Applications supporting those processes (via SUPPORTS edges)
- Technology Components (via RUNS_ON edges)
- Information Objects with classification levels
- Attributes needed: `nis2_category` on Process, `security_measures` on Application

**Report sections:**
1. Essential/important services inventory
2. Supporting application landscape per service
3. Security measure coverage gaps
4. Supply chain dependencies (vendor analysis)

**Format:** Checklist/matrix with compliance status indicators

**Filters:** By NIS2 category, by department, by gap type

---

### 7.2 GDPR Data Processing Register (Behandlingsregister)

**Purpose:** Generate or support the legally required register of data processing activities. Maps personal data to applications, purposes, and legal bases.

**Primary users:** DPO (Dataskyddsombud), Legal, Compliance

**Required data sources:**
- Information Objects with attributes: `contains_personal_data`, `data_categories`, `legal_basis`, `retention_period`
- Applications (via HANDLES edges) — the processing systems
- Processes — the purpose of processing
- Information Sources — where data originates

**Format:** Structured table matching GDPR Article 30 requirements:
- Processing activity (process)
- Purpose
- Categories of personal data (information objects)
- Processing systems (applications)
- Legal basis
- Retention period
- Technical/organizational measures

**Filters:** By legal basis, by data category, by application

**Note:** Requires new attributes on InformationObject: `contains_personal_data`, `legal_basis`, `retention_period`.

---

### 7.3 Risk Register — Application Risk Scorecard

**Purpose:** Score each application's risk level based on multiple factors. Prioritize security investments and remediation.

**Primary users:** CISO, Risk Manager, CIO

**Required data sources:**
- Applications with attributes: `status`, `driftform`, `leverantör`
- SUPPORTS edges (business criticality = number of critical processes)
- HANDLES edges (data sensitivity = highest classification of handled info objects)
- INTEGRATES_WITH edges (exposure = integration degree)
- Technology Components (technical risk = age/EOL status)

**Scoring dimensions:**
- Business criticality (0–5): based on number and importance of supported processes
- Data sensitivity (0–5): based on classification of handled information
- Technical risk (0–5): based on technology age, patch status, hosting model
- Integration exposure (0–5): based on number of integrations
- **Composite risk score** = weighted sum

**Format:** Heatmap or scored list. Top-N highest risk applications highlighted.

**Filters:** By risk dimension, minimum score threshold, by department

---

### 7.4 Business Criticality Impact Analysis (BIA)

**Purpose:** Determine the business impact if an application becomes unavailable. Supports business continuity planning and disaster recovery prioritization.

**Primary users:** CISO, Business Continuity Manager, CIO

**Required data sources:**
- Applications
- SUPPORTS edges → Processes (what stops working?)
- HANDLES edges → Information Objects (what data is unavailable?)
- INTEGRATES_WITH edges → other Applications (cascading failures?)
- Process attributes: `frekvens`, `ägare`

**Format:** Per-application impact card:
- Directly affected processes (count + names)
- Indirectly affected applications (via integrations, cascade depth)
- Data at risk (information objects)
- Estimated business impact severity

**Filters:** Select application, cascade depth, by department

---

### 7.5 Access & Authentication Landscape

**Purpose:** Map how users authenticate to each application. Identify applications without SSO, MFA, or centralized identity management.

**Primary users:** CISO, IT Security, Identity Manager

**Required data sources:**
- Applications with attributes: `auth_method` (SSO, SAML, local, LDAP, none), `mfa_enabled`, `identity_provider`
- RUNS_ON edges to identity-related Technology Components (Azure AD, ADFS, etc.)

**Format:** Matrix — applications as rows, security features as columns (SSO, MFA, centralized auth). Traffic-light indicators.

**Filters:** By auth method, by department, show non-SSO apps only

**Note:** Requires new attributes on Application: `auth_method`, `mfa_enabled`.

---

## 8. Portfolio & Lifecycle Management

### 8.1 Application Lifecycle Status Report

**Purpose:** Show the lifecycle status of every application. Identify apps that are aging, planned for retirement, or recently introduced.

**Primary users:** CIO, Application Owner, Portfolio Manager

**Required data sources:**
- Applications with attributes: `status` (Active, Planned, Under review, Phase-out, Retired), `go_live_date`, `planned_retirement_date`

**Format:** Dashboard with:
- Distribution pie chart (by status)
- Timeline of go-live and retirement dates
- Filterable list

**Filters:** By status, by department, by date range

---

### 8.2 Sunset & Migration Plan

**Purpose:** Plan the decommissioning of applications being phased out. Show what needs to migrate and where.

**Primary users:** CIO, Project Manager, Migration Lead

**Required data sources:**
- Applications with `status = Phase-out` or `Planned retirement`
- SUPPORTS edges (which processes lose support?)
- INTEGRATES_WITH edges (which integrations break?)
- HANDLES edges (which data needs to move?)
- Target/replacement application (new attribute: `replaced_by`)

**Format:** Per-application migration card:
- Current application details
- Replacement application (if identified)
- Affected processes, integrations, data
- Migration checklist / status

**Filters:** By retirement date, by department

---

### 8.3 Cost Allocation per Application

**Purpose:** Show the total cost of ownership per application and identify candidates for rationalization.

**Primary users:** CFO, CIO, Portfolio Manager

**Required data sources:**
- Applications with attributes: `annual_cost`, `license_model` (per user, enterprise, open source)
- SUPPORTS edges (cost per supported process)
- Number of users (if available)

**Format:** Sorted table with cost bars. Cost-per-process ratio. Bubble chart (cost vs. business value vs. user count).

**Filters:** By cost range, by license model, by department

**Note:** Requires new attributes: `annual_cost`, `license_model`, `user_count`.

---

### 8.4 Vendor Dependency Report

**Purpose:** Show how many applications and technology components come from each vendor. Identify concentration risk and negotiation leverage.

**Primary users:** CIO, Procurement, Risk Manager

**Required data sources:**
- Applications with attribute: `leverantör` (vendor)
- Technology Components with attribute: `leverantör`
- Cost data (if available)

**Format:** Grouped list by vendor:
- Number of applications per vendor
- Number of technology components per vendor
- Total estimated cost per vendor
- Dependency score (if one vendor is removed, how many apps are affected?)

**Filters:** By vendor, minimum dependency count

---

## Implementation Priority

Based on data already available in the tool and immediate governance value:

### Phase 1 — Can build now (data exists)
| Report | Rationale |
|---|---|
| 2.1 Process–Application Support Map | Core EA value; uses existing SUPPORTS edges |
| 4.1 Application Portfolio Overview | Direct listing of existing data |
| 4.2 Application Redundancy Report | Extends existing Overlap & Gaps |
| 5.1 Integration Map | Extends existing Landscape view |
| 1.1 EA Maturity Dashboard | Aggregates existing data into KPIs |
| 4.3 Application–Owner Accountability | Uses existing attributes |
| 8.4 Vendor Dependency Report | Uses existing `leverantör` attribute |

### Phase 2 — Needs minor attribute additions
| Report | New attributes needed |
|---|---|
| 3.2 Data Classification Matrix | `klassificering` on InformationObject |
| 6.2 Hosting & Deployment Map | Already has `driftform` |
| 8.1 Application Lifecycle Status | `go_live_date`, `planned_retirement_date` |
| 5.2 Integration Point-of-Failure | Computed from existing edges |
| 7.3 Risk Register | Computed scoring model |
| 7.4 Business Criticality (BIA) | Computed from existing edges |

### Phase 3 — Needs new data model extensions
| Report | Extension needed |
|---|---|
| 7.1 NIS2 Compliance Coverage | `nis2_category`, `security_measures` attributes |
| 7.2 GDPR Data Processing Register | `contains_personal_data`, `legal_basis`, `retention_period` |
| 7.5 Access & Authentication | `auth_method`, `mfa_enabled` attributes |
| 6.3 Technology Debt Heatmap | `end_of_support`, `end_of_life` attributes |
| 8.3 Cost Allocation | `annual_cost`, `license_model` attributes |
| 1.2 Strategic Roadmap | Timeline visualization + date attributes |
