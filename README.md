This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Excel Export & Google Drive sync

Each funnel page has **Excel** (download a multi-tab `.xlsx`: Main View, ICP Results,
Apollo / Reo DB / Crunchbase enrichment, Discarded, Funnel Summary) and **To Drive**
(uploads that same workbook into one shared Google Drive folder, timestamped).

The Drive button needs a Google **service account**:

1. In Google Cloud, create a service account, **enable the Drive API**, and download
   its JSON key.
2. In Google Drive, create a folder and **share it with the service account's email**
   (Editor). Copy the folder id from its URL (`.../folders/<THIS>`).
3. Add to the environment (`.env.local` locally, project env vars on Vercel). The
   base64 form avoids newline/quoting issues — generate it with
   `base64 -i your-key.json | tr -d '\n'`:

   ```
   GOOGLE_SERVICE_ACCOUNT_B64=<base64 of the key JSON>     # recommended
   # — or — GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account", ...}  (one line)
   GDRIVE_FOLDER_ID=<folder id from the folder's URL>
   ```

The funnel page shows a **Drive connected / not set up** indicator. Without these vars,
**Excel** download still works; **To Drive** reports it's not configured.

> Uses the full `drive` scope (not `drive.file`) so the service account can write
> into a user-owned folder shared with it. The account only needs **Editor** on
> that one folder.

# GTM-Funnel-Dashbaord
# GTM-Funnel-Dashbaord
# GTM-Funnel-Dashbaord
# GTM-Funnel-Dashbaord
