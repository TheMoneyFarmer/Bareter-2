export default {
  name: "blogPost",
  title: "Blog Post",
  type: "document",
  fields: [
    {
      name: "title",
      title: "Title",
      type: "string",
      validation: (Rule: { required: () => unknown }) => Rule.required(),
    },
    {
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (Rule: { required: () => unknown }) => Rule.required(),
    },
    {
      name: "excerpt",
      title: "Excerpt",
      type: "text",
      rows: 3,
      description: "Short summary shown on the blog list page (max 200 characters).",
    },
    {
      name: "coverImage",
      title: "Cover Image",
      type: "image",
      options: { hotspot: true },
      description: "Banner image shown at the top of the post and on the listing card.",
    },
    {
      name: "author",
      title: "Author",
      type: "string",
      description: "Display name of the author.",
    },
    {
      name: "category",
      title: "Category",
      type: "string",
      options: {
        list: [
          { title: "Bartering Tips", value: "bartering-tips" },
          { title: "Business Insights", value: "business-insights" },
          { title: "UAE Market", value: "uae-market" },
          { title: "Success Stories", value: "success-stories" },
          { title: "Platform Updates", value: "platform-updates" },
        ],
      },
    },
    {
      name: "publishedAt",
      title: "Published At",
      type: "datetime",
      description: "Controls when the post appears publicly. Leave blank to keep as a draft.",
    },
    {
      name: "body",
      title: "Body",
      type: "array",
      of: [
        { type: "block" },
        {
          type: "image",
          options: { hotspot: true },
          fields: [
            {
              name: "caption",
              title: "Caption",
              type: "string",
            },
            {
              name: "alt",
              title: "Alt text",
              type: "string",
            },
          ],
        },
      ],
      description: "Full article content in rich text. Supports headings, bold, links, and inline images.",
    },
  ],
  preview: {
    select: {
      title: "title",
      author: "author",
      media: "coverImage",
      publishedAt: "publishedAt",
    },
    prepare(selection: { title?: string; author?: string; publishedAt?: string }) {
      const { title, author, publishedAt } = selection;
      const date = publishedAt ? new Date(publishedAt).toLocaleDateString("en-GB") : "Draft";
      return {
        title: title ?? "Untitled",
        subtitle: `${author ? `by ${author} · ` : ""}${date}`,
      };
    },
  },
  orderings: [
    {
      title: "Published date, newest first",
      name: "publishedAtDesc",
      by: [{ field: "publishedAt", direction: "desc" }],
    },
  ],
};
