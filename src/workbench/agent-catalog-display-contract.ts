export type AgentCatalogDisplayRole = {
  roleId: string;
  displayName: string;
  description: string;
  skills: string[];
};

export type AgentCatalogDisplayProjection = {
  version: string;
  catalogHash: string;
  roles: AgentCatalogDisplayRole[];
};
