# GitHub Pages with Google Sheets and Drive

1. Create or open a private spreadsheet in the council's Google account. For a new script, choose **Extensions → Apps Script** in the spreadsheet to bind the script to that file. An existing standalone project can use the spreadsheet ID or URL.
2. Replace the project's `Code.gs` with [this repository's Code.gs](Code.gs). In **Project Settings → Script properties**, add:

   | Property | Value |
   | --- | --- |
   | `SPREADSHEET_ID` | Accessible spreadsheet ID or URL. Optional for a spreadsheet-bound project. |
   | `UPLOAD_FOLDER_ID` | Optional private Drive folder ID or URL. Leave blank to create a private uploads folder. |
   | `ADMIN_PASSWORD` | A unique, strong password of 16–512 characters |
   | `ADMIN_USERNAME` | Optional, defaults to `admin` |

3. Select `setup` in the Apps Script editor and run it as the council account. It creates the **BPS Complaints** tab and saves the resolved spreadsheet and folder IDs so the deployed web app can reopen them. If a configured folder cannot be opened, correct or clear its property and run `setup` again. Leave the header and record columns in place.
4. Choose **Deploy → New deployment → Web app**. Set **Execute as** to **Me** and **Who has access** to **Anyone**, including visitors who are signed out. Copy the HTTPS URL ending in `/exec`. A signed-out visit to that URL should return a small JSON health response. After editing Apps Script, update the deployment to a new version.
5. On GitHub, create `.github/workflows/pages.yml` on `main` and paste the [provided Pages workflow](pages.yml) into it. Select **Settings → Pages → Source → GitHub Actions**. The workflow reads `APPS_SCRIPT_URL` from `public/config.js`. To override it, add a repository variable of the same name under **Settings → Secrets and variables → Actions → Variables**. The URL is public. Keep the staff password exclusively in Apps Script properties. Under **Actions**, run **Publish complaint tracker** on `main`. The workflow publishes only `public/` and injects the URL into its `config.js`. For another static host, set `window.APPS_SCRIPT_URL` and `window.STATIC_FRONTEND = true` in `public/config.js` and serve that directory over HTTPS.
   Alternatively, select **Deploy from a branch**, choose `main` and `/(root)`, and save. The root `index.html` opens the citizen portal in `public/`. This option uses the URL already committed in `public/config.js`.
6. Open the Pages URL in a signed-out browser. Submit a synthetic complaint with a small JPEG or PNG, confirm the receipt and track the reference. Use the staff link to sign in, view the image, change status, add a remark, and confirm the public tracking result changed. Test that a signed-out browser cannot access staff records. Delete synthetic test data directly from the private sheet and Drive folder once finished.

Public tracking exposes only the reference, category, status and timestamps. Photos (JPEG, PNG, WebP or GIF, up to 2 MiB each) stay in Drive and are returned only to a signed-in officer. The officer session stays in the current page and expires after one hour or when the page is refreshed. Phone tracking stays available in the Node version. Existing SQLite records are not imported automatically.

### Recycle Bin, attachments and reports

- Officers can move resolved complaints to the Recycle Bin. These complaints disappear from public tracking, counters, active complaints and reports. Restoring returns the complaint and its attachments to the active list.
- Permanent deletion removes the complaint row and moves its attachments to Google Drive trash. Remove a citizen photo or resolution photo individually from the active complaint details. Google Drive manages retention of files in its trash.
- Run a report by date (Sri Lanka time), category, division, status or officer response. Export the results as CSV, PDF or XLSX. PDF and XLSX use a temporary private spreadsheet with a second sheet for the charts. The script moves the temporary spreadsheet to Drive trash after export. Apps Script and Drive quotas apply.
- When updating an existing Apps Script deployment, replace `Code.gs`, run `setup` as the owner and approve any newly requested permissions, including permission to make external HTTP requests for PDF and XLSX. Deploy a new version of the existing Web App and republish the frontend if needed.

References: [Apps Script web apps](https://developers.google.com/apps-script/guides/web) and [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-site).
