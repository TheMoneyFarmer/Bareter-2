export default {
  name: "howItWorksStep",
  title: "How It Works Step",
  type: "document",
  fields: [
    {
      name: "order",
      title: "Order",
      type: "number",
      description: "Step number (1, 2, 3 …). Steps are sorted by this field.",
      validation: (Rule: { required: () => unknown }) => Rule.required(),
    },
    {
      name: "title",
      title: "Title",
      type: "string",
      description: "Short title for this step.",
      validation: (Rule: { required: () => unknown }) => Rule.required(),
    },
    {
      name: "body",
      title: "Description",
      type: "text",
      description: "One- or two-sentence description of this step.",
    },
    {
      name: "iconName",
      title: "Icon Name",
      type: "string",
      description: "Icon identifier for this step — can be a Lucide icon name (e.g. 'ListChecks') or a single emoji (e.g. 📋).",
    },
  ],
  orderings: [
    {
      title: "Step Order",
      name: "orderAsc",
      by: [{ field: "order", direction: "asc" }],
    },
  ],
};
