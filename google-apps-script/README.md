# GitHub Pages with Google Sheets and Drive

1. Create a spreadsheet and a Drive folder in the council's Google account. Keep both private and restrict access to authorized staff. Copy the spreadsheet ID from its URL between `/d/` and the next slash, and the folder ID after `/folders/`.
2. In [Apps Script](https://script.google.com/) create a standalone project. Replace its `Code.gs` with [this repository's Code.gs](Code.gs). In **Project Settings → Script properties**, add:

   | Property | Value |
   | --- | --- |
   | `SPREADSHEET_ID` | Spreadsheet ID |
   | `UPLOAD_FOLDER_ID` | Private folder ID |
   | `ADMIN_PASSWORD` | A unique, strong password of 16–512 characters |
   | `ADMIN_USERNAME` | Optional, defaults to `admin` |

3. Select `setup` in the Apps Script editor and run it once. Approve access as the council account. This creates the **BPS Complaints** sheet tab. Leave the header and record columns in place.
4. Choose **Deploy → New deployment → Web app**. Set **Execute as** to **Me** and **Who has access** to **Anyone**, including visitors who are signed out. Copy the HTTPS URL ending in `/exec`. A signed-out visit to that URL should return a small JSON health response. After editing Apps Script, update the deployment to a new version.
5. On GitHub, create `.github/workflows/pages.yml` on `main` and paste the [provided Pages workflow](pages.yml) into it. Select **Settings → Pages → Source → GitHub Actions**. The workflow reads `APPS_SCRIPT_URL` from `public/config.js`. To override it, add a repository variable of the same name under **Settings → Secrets and variables → Actions → Variables**. The URL is public. Keep the staff password exclusively in Apps Script properties. Under **Actions**, run **Publish complaint tracker** on `main`. The workflow publishes only `public/` and injects the URL into its `config.js`. For another static host, set `window.APPS_SCRIPT_URL` and `window.STATIC_FRONTEND = true` in `public/config.js` and serve that directory over HTTPS.
6. Open the Pages URL in a signed-out browser. Submit a synthetic complaint with a small JPEG or PNG, confirm the receipt and track the reference. Open `admin.html`, sign in, view the image, change status, add a remark, and confirm the public tracking result changed. Test that a signed-out browser cannot access staff records. Delete synthetic test data directly from the private sheet and Drive folder once finished.

Public tracking exposes only the reference, category, status and timestamps. Photos (JPEG, PNG, WebP or GIF, up to 2 MiB each) stay in Drive and are returned only to a signed-in officer. The officer session stays in the current page and expires after one hour or when the page is refreshed. Apps Script quotas apply. The Apps Script version supports the citizen and staff flows above. Phone tracking, the recycle bin and report exports remain available in the Node version. Existing SQLite records are not imported automatically.

References: [Apps Script web apps](https://developers.google.com/apps-script/guides/web) and [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-site).
