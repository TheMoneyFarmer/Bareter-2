export default {
  name: "faqEntry",
  title: "FAQ Category",
  type: "document",
  fields: [
    {
      name: "order",
      title: "Order",
      type: "number",
      description: "Display order for this category (lower = first).",
    },
    {
      name: "category",
      title: "Category Name",
      type: "string",
      description: 'Category heading (e.g. "General", "Listings", "Payments").',
      validation: (Rule: { required: () => unknown }) => Rule.required(),
    },
    {
      name: "questions",
      title: "Questions",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            { name: "q", title: "Question", type: "string" },
            { name: "a", title: "Answer", type: "text" },
          ],
          preview: {
            select: { title: "q" },
          },
        },
      ],
    },
  ],
  orderings: [
    {
      title: "Category Order",
      name: "orderAsc",
      by: [{ field: "order", direction: "asc" }],
    },
  ],
};
