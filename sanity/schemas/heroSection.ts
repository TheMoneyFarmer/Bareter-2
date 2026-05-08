export default {
  name: "heroSection",
  title: "Hero Section",
  type: "document",
  fields: [
    {
      name: "headline",
      title: "Headline",
      type: "string",
      description: "Main headline on the landing page.",
    },
    {
      name: "tagline",
      title: "Tagline",
      type: "string",
      description: "Supporting tagline below the headline.",
    },
    {
      name: "ctaText",
      title: "CTA Button Text",
      type: "string",
      description: 'Label on the call-to-action button (e.g. "Start Bartering").',
    },
    {
      name: "ctaUrl",
      title: "CTA Button URL",
      type: "string",
      description: "URL the CTA button links to. Defaults to /register if blank.",
    },
  ],
  __experimental_actions: ["update", "publish"],
};
