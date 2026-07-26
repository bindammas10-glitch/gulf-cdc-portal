# Knowledge Mapping Page — Deployment & Access Handover (for IT)

**What this is:** an internal, static web page (HTML/CSS/JS only — no server, no
database, no API keys) that presents the GCDC Knowledge Mapping: core expertise
per staff member, coverage by department, and a browsable expertise map.

**Why we are moving it:** it currently runs on public GitHub Pages. It contains
staff names, positions and work email addresses, so it must be restricted to
GCDC staff. Azure Static Web Apps gives us Microsoft Entra ID sign-in on the
free tier, keeps automatic deployment, and lets the source repository become
private.

**Requested outcome**

1. Only signed-in GCDC work accounts can open the page.
2. It is reachable at a professional address, ideally **`knowledge.gulfcdc.org`**.
3. It can be linked or embedded in the Knowledge Management portal
   (`https://sghorgsa.sharepoint.com/sites/GCDCPortal`).

---

## 1. Create the Azure Static Web App

Azure Portal → **Create a resource** → **Static Web App**.

| Field | Value |
|---|---|
| Subscription / Resource group | per GCDC standards (e.g. `rg-gcdc-knowledge`) |
| Name | `gcdc-knowledge-mapping` |
| Hosting plan | **Free** (sufficient: static site, custom domain and auth included) |
| Region | closest available (e.g. West Europe) |
| Deployment source | **GitHub** → authorise → select this repository, branch **`main`** |
| Build presets | **Custom** |
| App location | `/` |
| Api location | *(leave empty)* |
| Output location | *(leave empty)* |

Azure creates a workflow file automatically. **This repository already contains
one** (`.github/workflows/azure-static-web-apps.yml`), so either let Azure add
its own and delete ours, or keep ours and only copy the deployment token — see
step 2. Do not run both.

> The generated default hostname looks like
> `https://<random-name>.azurestaticapps.net`. The custom domain in step 4 is
> what gives the professional URL.

## 2. Deployment token (only if keeping the existing workflow)

Azure Portal → the Static Web App → **Overview** → **Manage deployment token** →
copy it.

GitHub → repository → **Settings → Secrets and variables → Actions → New
repository secret**:

- Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
- Value: the copied token

Pushes to `main` then deploy automatically.

## 3. Require Entra ID sign-in

Authentication is already declared in **`staticwebapp.config.json`** in the
repository root: every route requires the `authenticated` role, anonymous
requests are redirected to `/.auth/login/aad`, and the built-in GitHub identity
provider is disabled.

On the Free plan the pre-configured Entra provider works with no app
registration. To restrict sign-in to the GCDC tenant only (recommended), register
a custom provider:

1. **Microsoft Entra ID → App registrations → New registration**
   - Name: `GCDC Knowledge Mapping Page`
   - Supported account types: **Accounts in this organizational directory only
     (single tenant)**
   - Redirect URI (Web):
     `https://<final-domain>/.auth/login/aad/callback`
     (add both the `*.azurestaticapps.net` hostname and, later,
     `knowledge.gulfcdc.org`)
2. Create a **client secret** and note the **Application (client) ID** and
   **Directory (tenant) ID**.
3. In the Static Web App → **Settings → Configuration**, add:
   - `AZURE_CLIENT_ID` = application (client) ID
   - `AZURE_CLIENT_SECRET` = client secret value
4. Optionally restrict further with an Entra **security group** (e.g. "GCDC
   Staff") via Conditional Access, or invite users under the Static Web App's
   **Role management**.

Because staff are already signed in to Microsoft 365, sign-in is normally a
silent redirect with no password prompt.

## 4. Custom domain — `knowledge.gulfcdc.org`

1. Static Web App → **Custom domains** → **Add** → *Custom domain on other DNS*
   → enter `knowledge.gulfcdc.org`.
2. Azure shows a validation record. In the `gulfcdc.org` DNS zone create:
   - **CNAME** — host `knowledge` → value `<random-name>.azurestaticapps.net`
   - plus the **TXT** validation record Azure displays.
3. Validate in Azure. The TLS certificate is issued automatically (free).
4. Add `https://knowledge.gulfcdc.org/.auth/login/aad/callback` to the app
   registration's redirect URIs (step 3.1).

## 5. Lock down the source repository

Once the Azure deployment is confirmed working:

1. GitHub → repository **Settings → General → Danger Zone → Change visibility →
   Private**. *(Azure Static Web Apps deploys from private repositories; this is
   what removes the public exposure of staff data.)*
2. **Settings → Pages** → set Source to **None** to retire the public
   `github.io` address.
3. Optionally delete the `gh-pages` branch and
   `.github/workflows/deploy-pages.yml`.

## 6. Publish it in the SharePoint portal

On `https://sghorgsa.sharepoint.com/sites/GCDCPortal`:

- **Simplest:** edit the page → **Quick Links** web part → add
  `https://knowledge.gulfcdc.org` labelled *Knowledge Mapping Page*.
- **Embedded view:** use the **Embed** web part with
  `<iframe src="https://knowledge.gulfcdc.org" width="100%" height="1100" frameborder="0"></iframe>`.
  The page already sends `frame-ancestors 'self' https://*.sharepoint.com`, so
  framing from SharePoint is permitted. A site collection admin may also need to
  add `knowledge.gulfcdc.org` under **Site Settings → HTML Field Security**.

## Security summary

| Control | Status |
|---|---|
| Transport | HTTPS enforced, certificate managed by Azure |
| Authentication | Microsoft Entra ID required on all routes |
| Server-side attack surface | None — static files only, no API, no database, no secrets in the repo |
| Third-party requests | None — all CSS, JS, data and images are self-hosted |
| Headers | CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` set in `staticwebapp.config.json` |
| Source visibility | To be set to **private** (step 5) |

## Contacts

- Business owner / content: Faris Aldammas — Knowledge Management, TCB
- Repository: `bindammas10-glitch/gulf-cdc-portal` (branch `main`)
- Data source of truth: `data/*.xlsx`; regenerate the site data with
  `python3 scripts/generate_data.py`
