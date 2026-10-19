-- Grunddata vid baslinjen (revision 0066): inbyggda roller, behörigheter,
-- rapporttaggar och tomma stommar – det de tidigare migreringarna lade in.
-- Framtaget med pg_dump --data-only --column-inserts; körs efter schema.sql.

INSERT INTO public.ea_roles (id, key, name, description, permissions, builtin, sort_order, updated_at, updated_by) VALUES ('bd05c63d-4f33-4e6b-9f06-32e87e99f496', 'lasare', 'Läsare', 'Ser objektet, läser dess dokument och delade anteckningar.', '["object.read", "documents.read", "notes.read"]', true, 10, now(), NULL);
INSERT INTO public.ea_roles (id, key, name, description, permissions, builtin, sort_order, updated_at, updated_by) VALUES ('04b7af3b-8032-4de0-a5da-062118757550', 'bidragsgivare', 'Bidragsgivare', 'Som Läsare, och laddar upp dokument och skriver anteckningar.', '["object.read", "documents.read", "notes.read", "documents.write", "notes.write"]', true, 20, now(), NULL);
INSERT INTO public.ea_roles (id, key, name, description, permissions, builtin, sort_order, updated_at, updated_by) VALUES ('7f3c2965-c40c-4615-b14f-f17c5db7b1b8', 'forvaltare', 'Förvaltare', 'Som Bidragsgivare, och redigerar objektet och dess kopplingar, läser Begränsade dokument och hanterar allas dokument och anteckningar.', '["object.read", "object.edit", "documents.read", "documents.read_restricted", "documents.write", "notes.read", "notes.write", "content.manage"]', true, 30, now(), NULL);

INSERT INTO public.ea_access_grants (id, principal_type, principal_role, group_id, user_id, role_id, scope_type, node_types, node_id, include_children, note, created_at, created_by) VALUES ('9d8750a7-98d6-488a-a458-48169c030787', 'everyone', NULL, NULL, NULL, 'bd05c63d-4f33-4e6b-9f06-32e87e99f496', 'types', '["Process", "Application", "InformationObject", "InformationSource", "TechnologyComponent", "ArchitecturePrinciple"]', NULL, false, 'Alla inloggade läser allt utom servrar – som före behörighetsmodellen.', now(), 'migrering');
INSERT INTO public.ea_access_grants (id, principal_type, principal_role, group_id, user_id, role_id, scope_type, node_types, node_id, include_children, note, created_at, created_by) VALUES ('df54ddbd-06f2-4b76-a8e5-8f51e504ad34', 'role', 'superuser', NULL, NULL, '7f3c2965-c40c-4615-b14f-f17c5db7b1b8', 'types', '["Process", "Application", "InformationObject", "InformationSource", "TechnologyComponent", "ArchitecturePrinciple"]', NULL, false, 'Redaktörer förvaltar allt utom servrar – som före behörighetsmodellen.', now(), 'migrering');

INSERT INTO public.ea_document_metadata (document_type, entries, updated_at, updated_by) VALUES ('target_architecture', '[{"label": "Ansvarig", "value": "Enterprise Architect"}, {"label": "Avdelning/enhet", "value": "IT"}, {"label": "Dokumentkategori", "value": "Rutiner"}, {"label": "Fastställd av", "value": ""}, {"label": "Fastställandedatum", "value": ""}]', now(), NULL);
INSERT INTO public.ea_document_metadata (document_type, entries, updated_at, updated_by) VALUES ('principle_document', '[{"label": "Ansvarig", "value": "Enterprise Architect"}, {"label": "Avdelning/enhet", "value": "IT"}, {"label": "Dokumentkategori", "value": "Rutiner"}, {"label": "Fastställd av", "value": ""}, {"label": "Fastställandedatum", "value": ""}]', now(), NULL);
INSERT INTO public.ea_document_metadata (document_type, entries, updated_at, updated_by) VALUES ('glossary', '[{"label": "Ansvarig", "value": "Enterprise Architect"}, {"label": "Avdelning/enhet", "value": "IT"}, {"label": "Dokumentkategori", "value": "Referens"}, {"label": "Fastställd av", "value": ""}, {"label": "Fastställandedatum", "value": ""}]', now(), NULL);

INSERT INTO public.ea_gap_analys (id, content, updated_at, updated_by) VALUES ('1159e157-ae9e-4399-9368-1241001f7dcc', '{"items": [], "handlingsplan": [], "rekommendationer": []}', now(), 'migration-0023');

INSERT INTO public.ea_home_blocks (key, body, updated_at, updated_by, enabled) VALUES ('about', 'Arkitekturportalen samlar organisationens enterprise-arkitektur — principer, målarkitektur, applikationslandskap och lösningsskisser.', now(), NULL, true);

INSERT INTO public.ea_nulaagesanalys (id, content, updated_at, updated_by) VALUES ('7f1f30d0-6365-49a1-9258-21d1e928ef3c', '{"sections": []}', now(), NULL);

INSERT INTO public.ea_principle_document (id, sections, created_at, updated_at) VALUES ('395540a1-9f74-472b-8400-3f340f6c139f', '{"introduction": "", "decision_forum": "", "deviation_handling": "", "target_arch_alignment": ""}', now(), now());

INSERT INTO public.ea_report_tags (id, slug, name, color, sort_order, created_at, updated_at) VALUES ('faadff5b-66b7-4474-bfdb-f9351e091481', 'verksamhet', 'Verksamhet', '#4CAF50', 10, now(), now());
INSERT INTO public.ea_report_tags (id, slug, name, color, sort_order, created_at, updated_at) VALUES ('c815d4e9-3ba0-4425-bf93-0060976c4ffa', 'applikation', 'Applikation', '#2196F3', 20, now(), now());
INSERT INTO public.ea_report_tags (id, slug, name, color, sort_order, created_at, updated_at) VALUES ('bc19324f-b2cb-4cc4-ac8b-9d775121052a', 'information', 'Information', '#FF9800', 30, now(), now());
INSERT INTO public.ea_report_tags (id, slug, name, color, sort_order, created_at, updated_at) VALUES ('d442b350-b086-49f8-a544-02bc7f5c9504', 'teknik', 'Teknik', '#9C27B0', 40, now(), now());
INSERT INTO public.ea_report_tags (id, slug, name, color, sort_order, created_at, updated_at) VALUES ('f7839f8c-7805-4837-a751-465a9ee48072', 'sakerhet', 'Säkerhet & kontinuitet', '#D32F2F', 50, now(), now());
INSERT INTO public.ea_report_tags (id, slug, name, color, sort_order, created_at, updated_at) VALUES ('b9ae0107-d65e-4de7-a2d2-9ad074c9d73d', 'ekonomi', 'Ekonomi', '#00897B', 60, now(), now());
INSERT INTO public.ea_report_tags (id, slug, name, color, sort_order, created_at, updated_at) VALUES ('189e85b6-fa1b-491d-a0fc-57eb54d5ed70', 'styrning', 'Styrning & utveckling', '#5E35B1', 70, now(), now());
INSERT INTO public.ea_report_tags (id, slug, name, color, sort_order, created_at, updated_at) VALUES ('195ab6dd-4a59-480d-ba73-89c60096682b', 'datakvalitet', 'Datakvalitet', '#607D8B', 80, now(), now());
INSERT INTO public.ea_report_tags (id, slug, name, color, sort_order, created_at, updated_at) VALUES ('e4ed276f-8a24-4d3d-8f61-730f597fbe0e', 'enkater', 'Enkäter', '#E65100', 90, now(), now());

INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('maturity', '189e85b6-fa1b-491d-a0fc-57eb54d5ed70');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('process-support', 'faadff5b-66b7-4474-bfdb-f9351e091481');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('portfolio', 'c815d4e9-3ba0-4425-bf93-0060976c4ffa');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('redundancy', 'c815d4e9-3ba0-4425-bf93-0060976c4ffa');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('overlap-gaps', 'faadff5b-66b7-4474-bfdb-f9351e091481');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('overlap-gaps', 'c815d4e9-3ba0-4425-bf93-0060976c4ffa');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('owners', '189e85b6-fa1b-491d-a0fc-57eb54d5ed70');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('integrations', 'c815d4e9-3ba0-4425-bf93-0060976c4ffa');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('vendors', 'c815d4e9-3ba0-4425-bf93-0060976c4ffa');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('classification', 'bc19324f-b2cb-4cc4-ac8b-9d775121052a');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('hosting', 'd442b350-b086-49f8-a544-02bc7f5c9504');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('lifecycle', 'c815d4e9-3ba0-4425-bf93-0060976c4ffa');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('risk', 'f7839f8c-7805-4837-a751-465a9ee48072');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('bia', 'f7839f8c-7805-4837-a751-465a9ee48072');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('bia', 'faadff5b-66b7-4474-bfdb-f9351e091481');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('nis2', 'f7839f8c-7805-4837-a751-465a9ee48072');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('gdpr', 'bc19324f-b2cb-4cc4-ac8b-9d775121052a');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('gdpr', 'f7839f8c-7805-4837-a751-465a9ee48072');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('auth', 'f7839f8c-7805-4837-a751-465a9ee48072');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('tech-debt', 'd442b350-b086-49f8-a544-02bc7f5c9504');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('tech-vendors', 'd442b350-b086-49f8-a544-02bc7f5c9504');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('tech-portfolio', 'd442b350-b086-49f8-a544-02bc7f5c9504');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('costs', 'b9ae0107-d65e-4de7-a2d2-9ad074c9d73d');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('roadmap', '189e85b6-fa1b-491d-a0fc-57eb54d5ed70');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('gap-progress', '189e85b6-fa1b-491d-a0fc-57eb54d5ed70');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('manual-objects', '195ab6dd-4a59-480d-ba73-89c60096682b');
INSERT INTO public.ea_report_tag_links (report_key, tag_id) VALUES ('flagged-objects', '195ab6dd-4a59-480d-ba73-89c60096682b');

INSERT INTO public.ea_target_architecture (id, content, updated_at, updated_by) VALUES ('00000000-0000-0000-0000-000000000001', '{"sections": [{"id": "background", "body": "", "kind": "text", "title": "Bakgrund"}, {"id": "overall-vision", "body": "", "kind": "vision", "title": "Övergripande målbild"}]}', now(), NULL);
