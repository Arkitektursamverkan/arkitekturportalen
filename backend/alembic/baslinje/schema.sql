-- Arkitekturportalens databasschema vid baslinjen (revision 0066).
-- Framtaget med pg_dump --schema-only ur en databas byggd med de tidigare
-- migreringarna 0001–0066; körs av alembic/versions/0066_baslinje.py.
-- Ändra inte: nya ändringar görs som nya migreringar.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE TABLE public.ea_access_grants (
    id uuid NOT NULL,
    principal_type character varying(20) NOT NULL,
    principal_role character varying(20),
    group_id uuid,
    user_id uuid,
    role_id uuid NOT NULL,
    scope_type character varying(10) NOT NULL,
    node_types jsonb DEFAULT '[]'::jsonb NOT NULL,
    node_id uuid,
    include_children boolean DEFAULT false NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255)
);

CREATE TABLE public.ea_architecture_journey (
    id integer NOT NULL,
    content jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255),
    CONSTRAINT ea_architecture_journey_single_row CHECK ((id = 1))
);

CREATE TABLE public.ea_audit_log (
    id uuid NOT NULL,
    action character varying(20) NOT NULL,
    entity_type character varying(20) NOT NULL,
    entity_id uuid NOT NULL,
    entity_name character varying(255),
    entity_subtype character varying(50),
    snapshot_before jsonb,
    snapshot_after jsonb,
    restored boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_name character varying(255),
    change_note character varying
);

CREATE TABLE public.ea_calendar_event_nodes (
    event_id uuid NOT NULL,
    node_id uuid NOT NULL
);

CREATE TABLE public.ea_calendar_events (
    id uuid NOT NULL,
    title character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    recurrence character varying(30) DEFAULT 'once'::character varying NOT NULL,
    start_date date NOT NULL,
    end_date date,
    start_time time without time zone,
    end_time time without time zone,
    change_freeze boolean DEFAULT false NOT NULL,
    responsible character varying(255) DEFAULT ''::character varying NOT NULL,
    other_dependencies text DEFAULT ''::text NOT NULL,
    status character varying(20) DEFAULT 'proposed'::character varying NOT NULL,
    proposed_by character varying(255),
    proposed_by_id character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_by character varying(255),
    resolved_at timestamp with time zone,
    resolution_note text,
    departments jsonb DEFAULT '[]'::jsonb NOT NULL,
    duration_days integer DEFAULT 1 NOT NULL
);

CREATE TABLE public.ea_change_entries (
    id uuid NOT NULL,
    title character varying(255) NOT NULL,
    starts_at timestamp without time zone NOT NULL,
    ends_at timestamp without time zone,
    affected_share character varying(10) DEFAULT 'none'::character varying NOT NULL,
    user_impact character varying(10) DEFAULT 'none'::character varying NOT NULL,
    change_type character varying(10) DEFAULT 'normal'::character varying NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    impact text DEFAULT ''::text NOT NULL,
    risks text DEFAULT ''::text NOT NULL,
    notify_departments jsonb DEFAULT '[]'::jsonb NOT NULL,
    approval_status character varying(10) DEFAULT 'pending'::character varying NOT NULL,
    approved_by character varying(255) DEFAULT ''::character varying NOT NULL,
    conflict_override boolean DEFAULT false NOT NULL,
    conflict_override_by character varying(255),
    created_by character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ea_change_entry_nodes (
    entry_id uuid NOT NULL,
    node_id uuid NOT NULL
);

CREATE TABLE public.ea_change_proposals (
    id uuid NOT NULL,
    node_id uuid NOT NULL,
    field character varying(255) NOT NULL,
    old_value text,
    new_value text NOT NULL,
    comment text,
    proposed_by character varying(255),
    proposed_by_id character varying(64),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_by character varying(255),
    resolved_at timestamp with time zone,
    resolution_note text
);

CREATE TABLE public.ea_comments (
    id uuid NOT NULL,
    subject_type character varying(40) NOT NULL,
    subject_id character varying(255) NOT NULL,
    body text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255),
    reviewed_at timestamp with time zone,
    reviewed_by character varying(255),
    reply text,
    CONSTRAINT ck_ea_comments_status CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT ck_ea_comments_subject_type CHECK (subject_type IN ('principle', 'target_architecture'))
);

CREATE TABLE public.ea_directory_hidden_departments (
    name character varying(255) NOT NULL
);

CREATE TABLE public.ea_directory_people (
    entra_oid character varying(64) NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    department character varying(255),
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ea_document_metadata (
    document_type character varying(50) NOT NULL,
    entries jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255)
);

CREATE TABLE public.ea_document_stamps (
    document_type character varying(100) NOT NULL,
    approved_at timestamp with time zone,
    approved_by character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    revised_at_override timestamp with time zone
);

CREATE TABLE public.ea_document_version (
    id uuid NOT NULL,
    document_type character varying(50) NOT NULL,
    version_major integer DEFAULT 0 NOT NULL,
    version_minor integer DEFAULT 1 NOT NULL,
    is_major boolean DEFAULT false NOT NULL,
    snapshot jsonb NOT NULL,
    audit_entries jsonb DEFAULT '[]'::jsonb NOT NULL,
    change_summary character varying,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255)
);

CREATE TABLE public.ea_edges (
    id uuid NOT NULL,
    source_id uuid NOT NULL,
    target_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ea_gap_analys (
    id uuid NOT NULL,
    content jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255)
);

CREATE TABLE public.ea_gap_status_log (
    id uuid NOT NULL,
    gap_item_id character varying(255) NOT NULL,
    task_id uuid,
    task_title text,
    from_status character varying(50) NOT NULL,
    to_status character varying(50) NOT NULL,
    comment text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255)
);

CREATE TABLE public.ea_gap_tasks (
    id uuid NOT NULL,
    gap_item_id character varying(255) NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status character varying(50) DEFAULT 'todo'::character varying NOT NULL,
    assigned_to character varying(255) DEFAULT ''::character varying NOT NULL,
    due_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    horizon character varying(10) DEFAULT ''::character varying NOT NULL,
    weight integer DEFAULT 1 NOT NULL
);

CREATE TABLE public.ea_glossary_request (
    id uuid NOT NULL,
    term character varying(255) NOT NULL,
    context text,
    requested_by character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ea_glossary_terms (
    id uuid NOT NULL,
    term character varying(255) NOT NULL,
    definition text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255)
);

CREATE TABLE public.ea_graph_snapshot (
    id uuid NOT NULL,
    snapshot_number integer NOT NULL,
    label character varying(255),
    node_count integer DEFAULT 0 NOT NULL,
    edge_count integer DEFAULT 0 NOT NULL,
    triggered_by character varying(30) DEFAULT 'manual'::character varying NOT NULL,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    audit_entries jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255)
);

CREATE TABLE public.ea_group_members (
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ea_groups (
    id uuid NOT NULL,
    name character varying(150) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255)
);

CREATE TABLE public.ea_home_banners (
    id uuid NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    severity character varying(16) DEFAULT 'info'::character varying NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255)
);

CREATE TABLE public.ea_home_blocks (
    key character varying(64) NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255),
    enabled boolean DEFAULT true NOT NULL
);

CREATE TABLE public.ea_node_deletion_logs (
    id uuid NOT NULL,
    node_id character varying(64) NOT NULL,
    node_name character varying(255) NOT NULL,
    node_type character varying(64) NOT NULL,
    reason text NOT NULL,
    deleted_by character varying(255) NOT NULL,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ea_node_document_versions (
    id uuid NOT NULL,
    document_id uuid NOT NULL,
    version_no integer NOT NULL,
    filename character varying(255) NOT NULL,
    content_type character varying(150) DEFAULT 'application/octet-stream'::character varying NOT NULL,
    size_bytes integer DEFAULT 0 NOT NULL,
    comment text DEFAULT ''::text NOT NULL,
    data bytea NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    uploaded_by character varying(255)
);

CREATE TABLE public.ea_node_documents (
    id uuid NOT NULL,
    node_id uuid NOT NULL,
    kind character varying(10) NOT NULL,
    title character varying(255) NOT NULL,
    doc_type character varying(30) DEFAULT 'ovrigt'::character varying NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    classification character varying(20) DEFAULT 'intern'::character varying NOT NULL,
    url text,
    review_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255)
);

CREATE TABLE public.ea_node_flags (
    id uuid NOT NULL,
    node_id uuid NOT NULL,
    flag_type character varying(30) NOT NULL,
    description text,
    created_by character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    response text,
    responded_by character varying(255),
    responded_at timestamp with time zone
);

CREATE TABLE public.ea_node_notes (
    id uuid NOT NULL,
    node_id uuid NOT NULL,
    body text NOT NULL,
    visibility character varying(10) DEFAULT 'shared'::character varying NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    author_user_id uuid,
    author_name character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    edited_at timestamp with time zone
);

CREATE TABLE public.ea_nodes (
    id uuid NOT NULL,
    type character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    external_source character varying(50) DEFAULT 'NONE'::character varying NOT NULL,
    external_id character varying(255),
    archived boolean DEFAULT false NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    admin_hidden boolean DEFAULT false NOT NULL,
    is_structure boolean DEFAULT false NOT NULL
);

CREATE TABLE public.ea_nulaagesanalys (
    id uuid NOT NULL,
    content jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255)
);

CREATE TABLE public.ea_org_settings (
    id integer NOT NULL,
    org_name character varying(200),
    org_short_name character varying(50),
    brand_color character varying(7),
    allowed_email_domains text,
    change_log_departments text,
    logo bytea,
    logo_content_type character varying(50),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255),
    anonymous_read boolean,
    modules text,
    navigation jsonb,
    CONSTRAINT ea_org_settings_single_row CHECK ((id = 1))
);

CREATE TABLE public.ea_principle_document (
    id uuid NOT NULL,
    sections jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ea_published_reports (
    id uuid NOT NULL,
    survey_id uuid,
    survey_title character varying(255) DEFAULT ''::character varying NOT NULL,
    report_number integer NOT NULL,
    name character varying(200) NOT NULL,
    payload jsonb NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    published_by character varying(255)
);

CREATE TABLE public.ea_report_names (
    report_key character varying(120) NOT NULL,
    name character varying(200) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255)
);

CREATE TABLE public.ea_report_tag_links (
    report_key character varying(120) NOT NULL,
    tag_id uuid NOT NULL
);

CREATE TABLE public.ea_report_tags (
    id uuid NOT NULL,
    slug character varying(50) NOT NULL,
    name character varying(60) NOT NULL,
    color character varying(7) DEFAULT '#E65100'::character varying NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ea_roles (
    id uuid NOT NULL,
    key character varying(40) NOT NULL,
    name character varying(100) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb NOT NULL,
    builtin boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255)
);

CREATE TABLE public.ea_solution_sketches (
    id uuid NOT NULL,
    title character varying(255) NOT NULL,
    description character varying DEFAULT ''::character varying NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255),
    CONSTRAINT ck_ea_solution_sketches_status CHECK (status IN ('draft', 'in_review', 'approved', 'archived'))
);

CREATE TABLE public.ea_survey_responses (
    id uuid NOT NULL,
    survey_id uuid NOT NULL,
    node_id uuid,
    raw_target_value text,
    assigned_user_id uuid,
    match_status character varying(20) DEFAULT 'unmatched'::character varying NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    token character varying(64) NOT NULL,
    submitted_at timestamp with time zone,
    submitted_by character varying(255),
    reviewed_at timestamp with time zone,
    reviewed_by character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ea_surveys (
    id uuid NOT NULL,
    title character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    target_node_type character varying(50) DEFAULT 'Application'::character varying NOT NULL,
    target_attribute_key character varying(100) DEFAULT 'systemförvaltare'::character varying NOT NULL,
    questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255),
    allow_multiple_responses boolean DEFAULT false NOT NULL,
    due_date date,
    include_decommissioned boolean DEFAULT false NOT NULL,
    kind character varying(20) DEFAULT 'standard'::character varying NOT NULL,
    reports jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE public.ea_target_architecture (
    id uuid NOT NULL,
    content jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255)
);

CREATE TABLE public.ea_users (
    id uuid NOT NULL,
    entra_oid character varying(64),
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'user'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone DEFAULT now(),
    password_hash character varying(255),
    home_shortcuts jsonb DEFAULT '["/reports/overlap-gaps"]'::jsonb NOT NULL,
    CONSTRAINT ck_ea_users_role CHECK (role IN ('user', 'superuser', 'admin'))
);

CREATE TABLE public.ea_workspace_events (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone,
    all_day boolean DEFAULT false NOT NULL,
    location character varying(255) DEFAULT ''::character varying NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255)
);

CREATE TABLE public.ea_workspace_files (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    filename character varying(255) NOT NULL,
    content_type character varying(150) DEFAULT 'application/octet-stream'::character varying NOT NULL,
    size_bytes integer DEFAULT 0 NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    data bytea NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    uploaded_by character varying(255),
    url character varying(2000)
);

CREATE TABLE public.ea_workspace_meetings (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    meeting_date date,
    template character varying(40) DEFAULT 'blank'::character varying NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255)
);

CREATE TABLE public.ea_workspace_members (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(20) DEFAULT 'member'::character varying NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    added_by character varying(255)
);

CREATE TABLE public.ea_workspace_pages (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255)
);

CREATE TABLE public.ea_workspace_posts (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    parent_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255),
    author_name character varying(255),
    edited_at timestamp with time zone
);

CREATE TABLE public.ea_workspace_tasks (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status character varying(20) DEFAULT 'todo'::character varying NOT NULL,
    assignee_user_id uuid,
    due_date date,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255),
    completed_at timestamp with time zone
);

CREATE TABLE public.ea_workspaces (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    visibility character varying(20) DEFAULT 'private'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by character varying(255),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(255),
    kind character varying(20) DEFAULT 'uppdrag'::character varying NOT NULL
);

ALTER TABLE ONLY public.ea_access_grants
    ADD CONSTRAINT ea_access_grants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_architecture_journey
    ADD CONSTRAINT ea_architecture_journey_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_audit_log
    ADD CONSTRAINT ea_audit_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_calendar_event_nodes
    ADD CONSTRAINT ea_calendar_event_nodes_pkey PRIMARY KEY (event_id, node_id);

ALTER TABLE ONLY public.ea_calendar_events
    ADD CONSTRAINT ea_calendar_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_change_entries
    ADD CONSTRAINT ea_change_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_change_entry_nodes
    ADD CONSTRAINT ea_change_entry_nodes_pkey PRIMARY KEY (entry_id, node_id);

ALTER TABLE ONLY public.ea_change_proposals
    ADD CONSTRAINT ea_change_proposals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_comments
    ADD CONSTRAINT ea_comments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_directory_hidden_departments
    ADD CONSTRAINT ea_directory_hidden_departments_pkey PRIMARY KEY (name);

ALTER TABLE ONLY public.ea_directory_people
    ADD CONSTRAINT ea_directory_people_pkey PRIMARY KEY (entra_oid);

ALTER TABLE ONLY public.ea_document_metadata
    ADD CONSTRAINT ea_document_metadata_pkey PRIMARY KEY (document_type);

ALTER TABLE ONLY public.ea_document_stamps
    ADD CONSTRAINT ea_document_stamps_pkey PRIMARY KEY (document_type);

ALTER TABLE ONLY public.ea_document_version
    ADD CONSTRAINT ea_document_version_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_edges
    ADD CONSTRAINT ea_edges_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_gap_analys
    ADD CONSTRAINT ea_gap_analys_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_gap_status_log
    ADD CONSTRAINT ea_gap_status_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_gap_tasks
    ADD CONSTRAINT ea_gap_tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_glossary_request
    ADD CONSTRAINT ea_glossary_request_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_glossary_terms
    ADD CONSTRAINT ea_glossary_terms_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_glossary_terms
    ADD CONSTRAINT ea_glossary_terms_term_key UNIQUE (term);

ALTER TABLE ONLY public.ea_graph_snapshot
    ADD CONSTRAINT ea_graph_snapshot_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_group_members
    ADD CONSTRAINT ea_group_members_pkey PRIMARY KEY (group_id, user_id);

ALTER TABLE ONLY public.ea_groups
    ADD CONSTRAINT ea_groups_name_key UNIQUE (name);

ALTER TABLE ONLY public.ea_groups
    ADD CONSTRAINT ea_groups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_home_banners
    ADD CONSTRAINT ea_home_banners_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_home_blocks
    ADD CONSTRAINT ea_home_blocks_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.ea_node_deletion_logs
    ADD CONSTRAINT ea_node_deletion_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_node_document_versions
    ADD CONSTRAINT ea_node_document_versions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_node_documents
    ADD CONSTRAINT ea_node_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_node_flags
    ADD CONSTRAINT ea_node_flags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_node_notes
    ADD CONSTRAINT ea_node_notes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_nodes
    ADD CONSTRAINT ea_nodes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_nulaagesanalys
    ADD CONSTRAINT ea_nulaagesanalys_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_org_settings
    ADD CONSTRAINT ea_org_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_principle_document
    ADD CONSTRAINT ea_principle_document_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_published_reports
    ADD CONSTRAINT ea_published_reports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_report_names
    ADD CONSTRAINT ea_report_names_pkey PRIMARY KEY (report_key);

ALTER TABLE ONLY public.ea_report_tag_links
    ADD CONSTRAINT ea_report_tag_links_pkey PRIMARY KEY (report_key, tag_id);

ALTER TABLE ONLY public.ea_report_tags
    ADD CONSTRAINT ea_report_tags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_report_tags
    ADD CONSTRAINT ea_report_tags_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.ea_roles
    ADD CONSTRAINT ea_roles_key_key UNIQUE (key);

ALTER TABLE ONLY public.ea_roles
    ADD CONSTRAINT ea_roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_solution_sketches
    ADD CONSTRAINT ea_solution_sketches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_survey_responses
    ADD CONSTRAINT ea_survey_responses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_surveys
    ADD CONSTRAINT ea_surveys_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_target_architecture
    ADD CONSTRAINT ea_target_architecture_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_users
    ADD CONSTRAINT ea_users_entra_oid_key UNIQUE (entra_oid);

ALTER TABLE ONLY public.ea_users
    ADD CONSTRAINT ea_users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_workspace_events
    ADD CONSTRAINT ea_workspace_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_workspace_files
    ADD CONSTRAINT ea_workspace_files_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_workspace_meetings
    ADD CONSTRAINT ea_workspace_meetings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_workspace_members
    ADD CONSTRAINT ea_workspace_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_workspace_pages
    ADD CONSTRAINT ea_workspace_pages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_workspace_posts
    ADD CONSTRAINT ea_workspace_posts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_workspace_tasks
    ADD CONSTRAINT ea_workspace_tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_workspaces
    ADD CONSTRAINT ea_workspaces_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ea_document_version
    ADD CONSTRAINT uq_document_version UNIQUE (document_type, version_major, version_minor);

ALTER TABLE ONLY public.ea_users
    ADD CONSTRAINT uq_ea_users_email UNIQUE (email);

ALTER TABLE ONLY public.ea_node_document_versions
    ADD CONSTRAINT uq_node_document_version UNIQUE (document_id, version_no);

ALTER TABLE ONLY public.ea_workspace_members
    ADD CONSTRAINT uq_workspace_member UNIQUE (workspace_id, user_id);

CREATE INDEX ix_ea_access_grants_group ON public.ea_access_grants USING btree (group_id);

CREATE INDEX ix_ea_access_grants_node ON public.ea_access_grants USING btree (node_id);

CREATE INDEX ix_ea_access_grants_user ON public.ea_access_grants USING btree (user_id);

CREATE INDEX ix_ea_audit_log_action ON public.ea_audit_log USING btree (action);

CREATE INDEX ix_ea_audit_log_entity_id ON public.ea_audit_log USING btree (entity_id);

CREATE INDEX ix_ea_audit_log_entity_type ON public.ea_audit_log USING btree (entity_type);

CREATE INDEX ix_ea_calendar_event_nodes_node_id ON public.ea_calendar_event_nodes USING btree (node_id);

CREATE INDEX ix_ea_calendar_events_status ON public.ea_calendar_events USING btree (status);

CREATE INDEX ix_ea_change_entries_starts_at ON public.ea_change_entries USING btree (starts_at);

CREATE INDEX ix_ea_change_entry_nodes_node_id ON public.ea_change_entry_nodes USING btree (node_id);

CREATE INDEX ix_ea_change_proposals_node_id ON public.ea_change_proposals USING btree (node_id);

CREATE INDEX ix_ea_change_proposals_status ON public.ea_change_proposals USING btree (status);

CREATE INDEX ix_ea_comments_status ON public.ea_comments USING btree (status);

CREATE INDEX ix_ea_comments_subject ON public.ea_comments USING btree (subject_type, subject_id);

CREATE INDEX ix_ea_directory_people_department ON public.ea_directory_people USING btree (department);

CREATE INDEX ix_ea_document_version_document_type ON public.ea_document_version USING btree (document_type);

CREATE INDEX ix_ea_edges_source_id ON public.ea_edges USING btree (source_id);

CREATE INDEX ix_ea_edges_target_id ON public.ea_edges USING btree (target_id);

CREATE INDEX ix_ea_edges_type ON public.ea_edges USING btree (type);

CREATE INDEX ix_ea_gap_status_log_gap_item_id ON public.ea_gap_status_log USING btree (gap_item_id);

CREATE INDEX ix_ea_gap_tasks_gap_item_id ON public.ea_gap_tasks USING btree (gap_item_id);

CREATE INDEX ix_ea_glossary_request_status ON public.ea_glossary_request USING btree (status);

CREATE INDEX ix_ea_glossary_terms_term_lower ON public.ea_glossary_terms USING btree (lower((term)::text));

CREATE INDEX ix_ea_graph_snapshot_number ON public.ea_graph_snapshot USING btree (snapshot_number);

CREATE INDEX ix_ea_group_members_user ON public.ea_group_members USING btree (user_id);

CREATE INDEX ix_ea_node_deletion_logs_deleted_at ON public.ea_node_deletion_logs USING btree (deleted_at);

CREATE INDEX ix_ea_node_document_versions_doc ON public.ea_node_document_versions USING btree (document_id);

CREATE INDEX ix_ea_node_documents_node ON public.ea_node_documents USING btree (node_id);

CREATE INDEX ix_ea_node_flags_node_id ON public.ea_node_flags USING btree (node_id);

CREATE INDEX ix_ea_node_notes_author ON public.ea_node_notes USING btree (author_user_id);

CREATE INDEX ix_ea_node_notes_node ON public.ea_node_notes USING btree (node_id, created_at);

CREATE INDEX ix_ea_nodes_external_source ON public.ea_nodes USING btree (external_source);

CREATE INDEX ix_ea_nodes_type ON public.ea_nodes USING btree (type);

CREATE INDEX ix_ea_published_reports_published_at ON public.ea_published_reports USING btree (published_at);

CREATE INDEX ix_ea_published_reports_survey_id ON public.ea_published_reports USING btree (survey_id);

CREATE INDEX ix_ea_report_tag_links_tag_id ON public.ea_report_tag_links USING btree (tag_id);

CREATE INDEX ix_ea_solution_sketches_status ON public.ea_solution_sketches USING btree (status);

CREATE INDEX ix_ea_solution_sketches_updated_at ON public.ea_solution_sketches USING btree (updated_at);

CREATE INDEX ix_ea_survey_responses_assigned_user_id ON public.ea_survey_responses USING btree (assigned_user_id);

CREATE INDEX ix_ea_survey_responses_node_id ON public.ea_survey_responses USING btree (node_id);

CREATE INDEX ix_ea_survey_responses_status ON public.ea_survey_responses USING btree (status);

CREATE INDEX ix_ea_survey_responses_survey_id ON public.ea_survey_responses USING btree (survey_id);

CREATE UNIQUE INDEX ix_ea_survey_responses_token ON public.ea_survey_responses USING btree (token);

CREATE INDEX ix_ea_surveys_status ON public.ea_surveys USING btree (status);

CREATE INDEX ix_ea_surveys_updated_at ON public.ea_surveys USING btree (updated_at);

CREATE INDEX ix_ea_users_email ON public.ea_users USING btree (email);

CREATE INDEX ix_ea_users_role ON public.ea_users USING btree (role);

CREATE INDEX ix_ea_workspace_events_ws ON public.ea_workspace_events USING btree (workspace_id, starts_at);

CREATE INDEX ix_ea_workspace_files_ws ON public.ea_workspace_files USING btree (workspace_id, uploaded_at);

CREATE INDEX ix_ea_workspace_meetings_ws ON public.ea_workspace_meetings USING btree (workspace_id, meeting_date);

CREATE INDEX ix_ea_workspace_members_user ON public.ea_workspace_members USING btree (user_id);

CREATE INDEX ix_ea_workspace_pages_ws ON public.ea_workspace_pages USING btree (workspace_id, sort_order);

CREATE INDEX ix_ea_workspace_posts_parent ON public.ea_workspace_posts USING btree (parent_id);

CREATE INDEX ix_ea_workspace_posts_ws ON public.ea_workspace_posts USING btree (workspace_id, created_at);

CREATE INDEX ix_ea_workspace_tasks_ws ON public.ea_workspace_tasks USING btree (workspace_id, status);

CREATE INDEX ix_ea_workspaces_kind ON public.ea_workspaces USING btree (kind);

CREATE INDEX ix_ea_workspaces_status ON public.ea_workspaces USING btree (status);

CREATE INDEX ix_ea_workspaces_visibility ON public.ea_workspaces USING btree (visibility);

CREATE UNIQUE INDEX uq_ea_nodes_external ON public.ea_nodes USING btree (external_source, external_id) WHERE ((external_source)::text <> 'NONE'::text);

CREATE UNIQUE INDEX uq_ea_survey_responses_survey_node ON public.ea_survey_responses USING btree (survey_id, node_id) WHERE ((match_status)::text <> 'random'::text);

CREATE UNIQUE INDEX uq_ea_survey_responses_survey_node_user ON public.ea_survey_responses USING btree (survey_id, node_id, assigned_user_id) WHERE ((match_status)::text = 'random'::text);

ALTER TABLE ONLY public.ea_access_grants
    ADD CONSTRAINT ea_access_grants_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.ea_groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_access_grants
    ADD CONSTRAINT ea_access_grants_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.ea_nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_access_grants
    ADD CONSTRAINT ea_access_grants_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.ea_roles(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.ea_access_grants
    ADD CONSTRAINT ea_access_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.ea_users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_calendar_event_nodes
    ADD CONSTRAINT ea_calendar_event_nodes_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.ea_calendar_events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_calendar_event_nodes
    ADD CONSTRAINT ea_calendar_event_nodes_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.ea_nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_change_entry_nodes
    ADD CONSTRAINT ea_change_entry_nodes_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.ea_change_entries(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_change_entry_nodes
    ADD CONSTRAINT ea_change_entry_nodes_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.ea_nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_change_proposals
    ADD CONSTRAINT ea_change_proposals_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.ea_nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_edges
    ADD CONSTRAINT ea_edges_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.ea_nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_edges
    ADD CONSTRAINT ea_edges_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.ea_nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_group_members
    ADD CONSTRAINT ea_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.ea_groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_group_members
    ADD CONSTRAINT ea_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.ea_users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_node_document_versions
    ADD CONSTRAINT ea_node_document_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.ea_node_documents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_node_documents
    ADD CONSTRAINT ea_node_documents_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.ea_nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_node_flags
    ADD CONSTRAINT ea_node_flags_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.ea_nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_node_notes
    ADD CONSTRAINT ea_node_notes_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.ea_users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.ea_node_notes
    ADD CONSTRAINT ea_node_notes_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.ea_nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_published_reports
    ADD CONSTRAINT ea_published_reports_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.ea_surveys(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.ea_report_tag_links
    ADD CONSTRAINT ea_report_tag_links_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.ea_report_tags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_survey_responses
    ADD CONSTRAINT ea_survey_responses_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.ea_users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.ea_survey_responses
    ADD CONSTRAINT ea_survey_responses_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.ea_nodes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_survey_responses
    ADD CONSTRAINT ea_survey_responses_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.ea_surveys(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_workspace_events
    ADD CONSTRAINT ea_workspace_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.ea_workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_workspace_files
    ADD CONSTRAINT ea_workspace_files_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.ea_workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_workspace_meetings
    ADD CONSTRAINT ea_workspace_meetings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.ea_workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_workspace_members
    ADD CONSTRAINT ea_workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.ea_users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_workspace_members
    ADD CONSTRAINT ea_workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.ea_workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_workspace_pages
    ADD CONSTRAINT ea_workspace_pages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.ea_workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_workspace_posts
    ADD CONSTRAINT ea_workspace_posts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.ea_workspace_posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_workspace_posts
    ADD CONSTRAINT ea_workspace_posts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.ea_workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ea_workspace_tasks
    ADD CONSTRAINT ea_workspace_tasks_assignee_user_id_fkey FOREIGN KEY (assignee_user_id) REFERENCES public.ea_users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.ea_workspace_tasks
    ADD CONSTRAINT ea_workspace_tasks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.ea_workspaces(id) ON DELETE CASCADE;
