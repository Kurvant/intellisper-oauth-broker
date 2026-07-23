# OAuth Apps To Create

This document lists **every OAuth2 provider (developer app) you must register** to power the OAuth blocks in `packages/blocks/community`.

**How to read this:**
- Every block that declares its auth with `BlockAuth.OAuth2({ ... })` needs a client id / client secret.
- **Blocks that share the same OAuth provider (same `authUrl` host) share ONE app.** Register the app once, then paste the **same** client id / secret into `OAUTH_PROVIDERS` for **each** block name listed under that provider. Example: all 15 Google blocks use a single Google Cloud OAuth client.
- The env map (`OAUTH_PROVIDERS`) is keyed **per block name**, so section 3 below expands one JSON entry per block. Fill each `REPLACE` — but within a shared provider, use the same real credentials for every block in that group.
- Section 4 lists blocks whose OAuth app is created by the **end user on their own instance** (self-hosted / per-tenant / generic). Do **NOT** create those centrally.

**Totals: 116 OAuth2 blocks in all. 111 are centrally registerable across 74 unique providers (4 shared providers — Google, Microsoft, Zoho, Meta — cover 41 of those blocks; the remaining 70 blocks each get their own provider app). The other 5 blocks are per-instance / not centrally registerable.**

Package name form: `@intelblocks/block-<folder>` where `<folder>` is the block directory name.

---

## 1 & 2. Providers to register

### Shared providers (one app, many blocks)

#### Google
- `clientId: REPLACE`
- `clientSecret: REPLACE`
- Console: https://console.cloud.google.com/apis/credentials (create an OAuth 2.0 Client ID; enable each product's API)
- Blocks (15):
  - `@intelblocks/block-youtube`
  - `@intelblocks/block-google-my-business`
  - `@intelblocks/block-google-forms`
  - `@intelblocks/block-google-drive`
  - `@intelblocks/block-google-docs`
  - `@intelblocks/block-google-contacts`
  - `@intelblocks/block-google-calendar`
  - `@intelblocks/block-google-cloud-storage`
  - `@intelblocks/block-google-bigquery`
  - `@intelblocks/block-google-tasks`
  - `@intelblocks/block-google-slides`
  - `@intelblocks/block-gmail`
  - `@intelblocks/block-google-sheets`
  - `@intelblocks/block-google-search-console`
  - `@intelblocks/block-googlechat`

#### Microsoft
(authUrl `login.microsoftonline.com` / `{cloud}` resolves to the Azure cloud host, default `login.microsoftonline.com`; `{tenantId}` = `common`. One Azure AD / Entra app registration covers all.)
- `clientId: REPLACE`
- `clientSecret: REPLACE`
- Console: https://entra.microsoft.com (Azure portal → App registrations)
- Blocks (15):
  - `@intelblocks/block-azure-ad`
  - `@intelblocks/block-microsoft-todo`
  - `@intelblocks/block-microsoft-teams`
  - `@intelblocks/block-microsoft-outlook-calendar`
  - `@intelblocks/block-microsoft-outlook`
  - `@intelblocks/block-microsoft-onenote`
  - `@intelblocks/block-microsoft-dynamics-crm`
  - `@intelblocks/block-microsoft-sharepoint`
  - `@intelblocks/block-microsoft-onedrive`
  - `@intelblocks/block-microsoft-power-bi`
  - `@intelblocks/block-microsoft-dynamics-365-business-central`
  - `@intelblocks/block-microsoft-excel-365`
  - `@intelblocks/block-microsoft-copilot`
  - `@intelblocks/block-microsoft-365-planner`
  - `@intelblocks/block-microsoft-365-people`

#### Zoho
(authUrl `accounts.{location}` / `accounts.zoho.{region}` / `{domain}` — the placeholder is only the Zoho data-center region selector, e.g. `accounts.zoho.com`, `.eu`, `.in`. One Zoho API console app covers all regions/products.)
- `clientId: REPLACE`
- `clientSecret: REPLACE`
- Console: https://api-console.zoho.com
- Blocks (8):
  - `@intelblocks/block-zoho-mail`
  - `@intelblocks/block-zoho-invoice`
  - `@intelblocks/block-zoho-desk`
  - `@intelblocks/block-zoho-crm`
  - `@intelblocks/block-zoho-campaigns`
  - `@intelblocks/block-zoho-books`
  - `@intelblocks/block-zoho-bookings`
  - `@intelblocks/block-bigin-by-zoho`

#### Meta / Facebook
(authUrl `graph.facebook.com` — one Meta app with the relevant products/permissions.)
- `clientId: REPLACE`
- `clientSecret: REPLACE`
- Console: https://developers.facebook.com/apps
- Blocks (3):
  - `@intelblocks/block-facebook-pages`
  - `@intelblocks/block-facebook-leads`
  - `@intelblocks/block-instagram-business`

### Single-block providers (one app each)

| Provider | authUrl host | Developer console | Block |
|---|---|---|---|
| Acuity Scheduling | acuityscheduling.com | https://developers.acuityscheduling.com | `@intelblocks/block-acuity-scheduling` |
| Asana | app.asana.com | https://app.asana.com/0/my-apps | `@intelblocks/block-asana` |
| Zoom | zoom.us | https://marketplace.zoom.us | `@intelblocks/block-zoom` |
| Baremetrics | app.baremetrics.com | https://developers.baremetrics.com | `@intelblocks/block-baremetrics` |
| Bexio | auth.bexio.com | https://developer.bexio.com | `@intelblocks/block-bexio` |
| Box | account.box.com | https://app.box.com/developers/console | `@intelblocks/block-box` |
| Capsule CRM | api.capsulecrm.com | https://developer.capsulecrm.com | `@intelblocks/block-capsule-crm` |
| Canva | canva.com | https://www.canva.com/developers | `@intelblocks/block-canva` |
| ClicData | api.clicdata.com | https://app.clicdata.com (Account → API) | `@intelblocks/block-clicdata` |
| CloudConvert | cloudconvert.com | https://cloudconvert.com/dashboard/api/v2/oauth-clients | `@intelblocks/block-cloudconvert` |
| ClickUp | app.clickup.com | https://app.clickup.com (Settings → Apps) | `@intelblocks/block-clickup` |
| Digital Ocean | cloud.digitalocean.com | https://cloud.digitalocean.com/account/api/applications | `@intelblocks/block-digital-ocean` |
| Constant Contact | authz.constantcontact.com | https://developer.constantcontact.com | `@intelblocks/block-constant-contact` |
| ConnectUC | auth.uc-technologies.com | https://developer.connectuc.io (UC Technologies) | `@intelblocks/block-connectuc` |
| FormStack | formstack.com | https://developers.formstack.com | `@intelblocks/block-formstack` |
| Dropbox | dropbox.com | https://www.dropbox.com/developers/apps | `@intelblocks/block-dropbox` |
| Figma | figma.com | https://www.figma.com/developers/apps | `@intelblocks/block-figma` |
| Fathom | fathom.video | https://fathom.video (developer settings) | `@intelblocks/block-fathom` |
| GetResponse | app.getresponse.com | https://app.getresponse.com (Integrations & API) | `@intelblocks/block-getresponse` |
| Xero | login.xero.com | https://developer.xero.com/app/manage | `@intelblocks/block-xero` |
| Hootsuite | platform.hootsuite.com | https://developer.hootsuite.com | `@intelblocks/block-hootsuite` |
| GitLab | gitlab.com | https://gitlab.com/-/profile/applications | `@intelblocks/block-gitlab` |
| Greenhouse | auth.greenhouse.io | https://developers.greenhouse.io | `@intelblocks/block-greenhouse` |
| GitHub | github.com | https://github.com/settings/developers | `@intelblocks/block-github` |
| Wootric | (client_credentials; api.wootric.com) | https://app.wootric.com (Settings → API) | `@intelblocks/block-wootric` |
| Wrike | login.wrike.com | https://developers.wrike.com | `@intelblocks/block-wrike` |
| InstaCharts | api.instacharts.io | https://instacharts.io (developer settings) | `@intelblocks/block-insta-charts` |
| Intercom | app.{region}.com (Intercom hosted regions) | https://app.intercom.com/a/apps/_/developer-hub | `@intelblocks/block-intercom` |
| HubSpot | app.hubspot.com | https://developers.hubspot.com | `@intelblocks/block-hubspot` |
| Help Scout | secure.helpscout.net | https://developer.helpscout.com | `@intelblocks/block-help-scout` |
| Harvest | id.getharvest.com | https://id.getharvest.com/developers | `@intelblocks/block-harvest` |
| Lead Connector (GoHighLevel) | marketplace.gohighlevel.com | https://marketplace.gohighlevel.com | `@intelblocks/block-lead-connector` |
| Lightfunnels | app.lightfunnels.com | https://app.lightfunnels.com (developer apps) | `@intelblocks/block-lightfunnels` |
| LinkedIn | linkedin.com | https://www.linkedin.com/developers/apps | `@intelblocks/block-linkedin` |
| Weekdone | weekdone.com | https://weekdone.com (API settings) | `@intelblocks/block-weekdone` |
| Weekdone (2nd folder) | weekdone.com | https://weekdone.com (API settings) | `@intelblocks/block-week-done` |
| Mailchimp | login.mailchimp.com | https://mailchimp.com/developer | `@intelblocks/block-mailchimp` |
| MeisterTask / MindMeister | mindmeister.com | https://www.mindmeister.com/account/apps | `@intelblocks/block-meistertask` |
| Netlify | app.netlify.com | https://app.netlify.com/user/applications | `@intelblocks/block-netlify` |
| Nifty | nifty.pm | https://nifty.pm (developer/API settings) | `@intelblocks/block-nifty` |
| MyCase | auth.mycase.com | https://www.mycase.com (developer portal) | `@intelblocks/block-mycase-piece` |
| Notion | api.notion.com | https://www.notion.so/my-integrations | `@intelblocks/block-notion` |
| Podio | podio.com | https://podio.com/settings/api | `@intelblocks/block-podio` |
| Vimeo | api.vimeo.com | https://developer.vimeo.com/apps | `@intelblocks/block-vimeo` |
| Pinterest | (auth via pinterest.com) | https://developers.pinterest.com/apps | `@intelblocks/block-pinterest` |
| Pipedrive | (oauth.pipedrive.com) | https://developers.pipedrive.com | `@intelblocks/block-pipedrive` |
| Raindrop | raindrop.io | https://app.raindrop.io/settings/integrations | `@intelblocks/block-raindrop` |
| QuickBooks | appcenter.intuit.com | https://developer.intuit.com | `@intelblocks/block-quickbooks` |
| Reddit | reddit.com | https://www.reddit.com/prefs/apps | `@intelblocks/block-reddit` |
| Salesforce | {environment} (login/test/custom My Domain) | https://developer.salesforce.com (Connected App) | `@intelblocks/block-salesforce` |
| SavvyCal | savvycal.com | https://savvycal.com/developers | `@intelblocks/block-savvycal` |
| SimplyPrint | (panel host) | https://simplyprint.io (Panel → developer apps) | `@intelblocks/block-simplyprint` |
| Slack | slack.com | https://api.slack.com/apps | `@intelblocks/block-slack` |
| SignNow | app.signnow.com | https://www.signnow.com/developers | `@intelblocks/block-sign-now` |
| SurveyMonkey | api.surveymonkey.com | https://developer.surveymonkey.com/apps | `@intelblocks/block-surveymonkey` |
| Typeform | admin.typeform.com | https://www.typeform.com/developers | `@intelblocks/block-typeform` |
| Teamleader | focus.teamleader.eu | https://marketplace.focus.teamleader.eu | `@intelblocks/block-teamleader` |
| Todoist | todoist.com | https://developer.todoist.com/appconsole.html | `@intelblocks/block-todoist` |
| Tenzo | auth.gotenzo.com | https://www.gotenzo.com (developer/API) | `@intelblocks/block-tenzo` |
| Twitch | id.twitch.tv | https://dev.twitch.tv/console/apps | `@intelblocks/block-twitch` |
| TickTick | ticktick.com | https://developer.ticktick.com/manage | `@intelblocks/block-ticktick` |
| Square | connect.squareup.com | https://developer.squareup.com/apps | `@intelblocks/block-square` |
| TrueLayer | auth.truelayer.com | https://console.truelayer.com | `@intelblocks/block-truelayer` |
| Spotify | accounts.spotify.com | https://developer.spotify.com/dashboard | `@intelblocks/block-spotify` |
| Teable (Cloud) | app.teable.ai | https://app.teable.ai (OAuth apps) | `@intelblocks/block-teable` |
| VideoAsk | auth.videoask.com | https://www.videoask.com (developer settings) | `@intelblocks/block-videoask` |
| Webflow | webflow.com | https://developers.webflow.com | `@intelblocks/block-webflow` |
| Webex | webexapis.com | https://developer.webex.com/my-apps | `@intelblocks/block-webex` |
| Klaviyo | klaviyo.com | https://www.klaviyo.com/oauth (developer portal) | `@intelblocks/block-klaviyo` |
| FreeAgent | api.freeagent.com | https://dev.freeagent.com | `@intelblocks/block-free-agent` |

> Note: `pinterest` and `pipedrive` declare `BlockAuth.OAuth2` but keep the authUrl in a helper/constant; both are standard central provider apps (Pinterest developer app, Pipedrive marketplace app).

---

## 3. Ready-to-paste `OAUTH_PROVIDERS` skeleton

One entry per centrally-registerable OAuth block (111 entries). Within a shared provider (Google, Microsoft, Zoho, Meta) paste the **same** real client id/secret into every listed block. Per-instance blocks (section 4) are intentionally **omitted** — their credentials are supplied by the end user, not you.

```json
[
{"blockName":"@intelblocks/block-youtube","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-google-my-business","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-google-forms","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-google-drive","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-google-docs","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-google-contacts","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-google-calendar","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-google-cloud-storage","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-google-bigquery","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-google-tasks","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-google-slides","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-gmail","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-google-sheets","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-google-search-console","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-googlechat","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-azure-ad","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-microsoft-todo","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-microsoft-teams","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-microsoft-outlook-calendar","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-microsoft-outlook","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-microsoft-onenote","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-microsoft-dynamics-crm","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-microsoft-sharepoint","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-microsoft-onedrive","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-microsoft-power-bi","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-microsoft-dynamics-365-business-central","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-microsoft-excel-365","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-microsoft-copilot","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-microsoft-365-planner","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-microsoft-365-people","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-zoho-mail","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-zoho-invoice","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-zoho-desk","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-zoho-crm","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-zoho-campaigns","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-zoho-books","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-zoho-bookings","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-bigin-by-zoho","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-facebook-pages","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-facebook-leads","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-instagram-business","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-acuity-scheduling","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-asana","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-zoom","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-baremetrics","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-bexio","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-box","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-capsule-crm","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-canva","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-clicdata","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-cloudconvert","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-clickup","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-digital-ocean","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-constant-contact","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-connectuc","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-formstack","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-dropbox","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-figma","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-fathom","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-getresponse","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-xero","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-hootsuite","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-gitlab","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-greenhouse","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-github","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-wootric","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-wrike","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-insta-charts","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-intercom","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-hubspot","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-help-scout","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-harvest","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-lead-connector","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-lightfunnels","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-linkedin","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-weekdone","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-week-done","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-mailchimp","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-meistertask","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-netlify","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-nifty","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-mycase-piece","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-notion","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-podio","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-vimeo","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-pinterest","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-pipedrive","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-raindrop","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-quickbooks","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-reddit","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-salesforce","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-savvycal","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-simplyprint","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-slack","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-sign-now","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-surveymonkey","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-typeform","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-teamleader","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-todoist","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-tenzo","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-twitch","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-ticktick","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-square","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-truelayer","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-spotify","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-teable","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-videoask","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-webflow","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-webex","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-klaviyo","clientId":"REPLACE","clientSecret":"REPLACE"},
{"blockName":"@intelblocks/block-free-agent","clientId":"REPLACE","clientSecret":"REPLACE"}
]
```

---

## 4. Per-instance / NOT centrally registerable

These blocks use OAuth2, but the OAuth **app is registered by the end user on their own instance/tenant** (self-hosted, per-customer domain, or a fully generic connector). Do **NOT** create a central app for these — the user provides their own client id/secret at connection time.

| Block | Why per-instance | authUrl template |
|---|---|---|
| `@intelblocks/block-workday` | Each customer's own Workday tenant + ISU; auth/API host and tenant are per-install. | `https://{authHost}/{tenant}/authorize` |
| `@intelblocks/block-gitea` | Self-hosted Gitea; the OAuth2 app is created inside the user's own Gitea instance. | `{baseUrl}/login/oauth/authorize` |
| `@intelblocks/block-snowflake` | Customer creates a Snowflake security integration in their own account (`ACCOUNTADMIN`). | `https://{account}.snowflakecomputing.com/oauth/authorize` |
| `@intelblocks/block-http-oauth2` | Generic OAuth2 HTTP connector; user supplies authUrl, tokenUrl, scopes, and client credentials. | `{authUrl}` |
| `@intelblocks/block-mycase-piece` | MyCase firm-scoped app; verify whether a shared partner app is available before registering centrally (treated as per-instance to be safe). | `https://auth.mycase.com/login_sessions/new` |

> `@intelblocks/block-teable` also offers a self-hosted Personal-Access-Token path, but its OAuth2 path is Teable Cloud only — so it is listed as a central provider above (register on app.teable.ai).

---

### Notes / verification caveats
- `weekdone` and `week-done` are two **separate** block folders that both target `weekdone.com` (likely a legacy/duplicate pair). They share one Weekdone app; both are listed so the per-block env map is complete. Consider consolidating/removing one.
- Excluded (declares an `authUrl` string but is NOT `BlockAuth.OAuth2` — token/SecretText auth): `medullar` (uses `medullarCommon.authUrl` as an API base path), `google-search-console`'s `new google.auth.OAuth2()` (googleapis library instance, the block's real auth is the `googleSearchConsoleAuth` OAuth2 above), and `zoo`'s `get-oauth2-providers` action (reads providers, not a block auth).
- Console URLs are best-known developer-portal locations; confirm the exact redirect-URI registration screen per provider when creating each app.
