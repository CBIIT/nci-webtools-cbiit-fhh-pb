export interface TagsConfig {
  tier: string;
  resourceName: string;
}

export function createTags(config: TagsConfig): Record<string, string> {
  return {
    Project: "fhhpb",
    ApplicationName: "fhhpb", 
    CreatedBy: "CDK",
    EnvironmentTier: config.tier.toUpperCase(),
    CreateDate: new Date().toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit', 
      year: 'numeric'
    }),
    ResourceName: `${config.tier}-fhhpb-${config.resourceName}`
  };
}
