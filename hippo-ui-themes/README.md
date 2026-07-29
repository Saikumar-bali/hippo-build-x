# Hippo Build X UI Themes

This package contains six themes for the current Next.js + Tailwind application.

## Recommended choice

Use **Corporate Blue** as the default ERP theme. It feels reliable for sales, finance, project, procurement and administrative work. Keep **Dark Modern** as an optional user preference. Use **Sunset Warm** or a softened Corporate Blue variant for the customer portal.

## Install

Copy these files to:

```text
apps/web/src/components/theme/
```

Merge `globals.css` into:

```text
apps/web/src/app/globals.css
```

Use `layout.example.js` as a guide for `apps/web/src/app/layout.js`.

Render the sample:

```js
import DashboardPreview from "@/components/theme/DashboardPreview";

export default function Page() {
  return <DashboardPreview />;
}
```

No additional UI library is required.
