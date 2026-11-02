"""Shared schema types used across multiple endpoints."""
from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel


class NodeType(str, Enum):
    PROCESS = "Process"
    APPLICATION = "Application"
    INFORMATION_OBJECT = "InformationObject"
    INFORMATION_SOURCE = "InformationSource"
    TECHNOLOGY_COMPONENT = "TechnologyComponent"
    SERVER = "Server"
    # A service run on servers (DNS, nätverk …), from the Servertjänster list.
    SERVER_SERVICE = "ServerService"
    ARCHITECTURE_PRINCIPLE = "ArchitecturePrinciple"
    # An object in a list an admin added; attributes.list_key names the list (app.domain_lists).
    CUSTOM_OBJECT = "CustomObject"


class PrincipleDomain(str, Enum):
    OVERARCHING = "Övergripande"
    BUSINESS = "Verksamhet"
    INFORMATION = "Information"
    APPLICATION = "Applikation"
    TECHNOLOGY = "Teknik"


class PrincipleStatus(str, Enum):
    PROPOSAL = "Förslag"
    DECIDED = "Beslutad"
    INTRODUCED = "Infört"
    RETIRED = "Avvecklad"


class EdgeType(str, Enum):
    USES = "USES"
    SUPPORTS = "SUPPORTS"
    HANDLES = "HANDLES"
    REALIZES = "REALIZES"
    CONTAINS = "CONTAINS"
    RUNS_ON = "RUNS_ON"
    INTEGRATES_WITH = "INTEGRATES_WITH"


class IntegrationDirection(str, Enum):
    """Which way information flows over an INTEGRATES_WITH edge.

    Named relative to the edge's own source/target, so the stored value stays
    correct no matter which end the reader happens to be looking from.
    Integrations recorded before the field existed are BIDIRECTIONAL.
    """

    SOURCE_TO_TARGET = "SOURCE_TO_TARGET"
    BIDIRECTIONAL = "BIDIRECTIONAL"
    TARGET_TO_SOURCE = "TARGET_TO_SOURCE"


class ExternalSource(str, Enum):
    NONE = "NONE"
    SHAREPOINT = "SHAREPOINT"
    TWO_C8 = "2C8"
    CSV = "CSV"


class GraphNodeOut(BaseModel):
    """Node representation consumed by the frontend Cytoscape graph."""

    id: str
    type: NodeType
    name: str
    description: str | None = None
    external_source: ExternalSource = ExternalSource.NONE
    archived: bool = False
    attributes: dict[str, Any] = {}


class GraphEdgeOut(BaseModel):
    """Edge representation consumed by the frontend Cytoscape graph."""

    id: str
    source: str
    target: str
    type: EdgeType
    attributes: dict[str, Any] = {}


class GraphData(BaseModel):
    """Full graph payload returned by all /views/* endpoints."""

    nodes: list[GraphNodeOut]
    edges: list[GraphEdgeOut]


class HealthStatus(BaseModel):
    status: str
    db_engine: str
    db_ok: bool
    version: str


class ErrorResponse(BaseModel):
    detail: str


class MessageResponse(BaseModel):
    message: str
