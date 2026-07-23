# PROVIDER_HOST_ALLOWLIST

Derived from the actual `tokenUrl:` value of every `BlockAuth.OAuth2(...)` block under
`packages/blocks/community/*/src/**/*.ts`. Hosts are collapsed to registrable base domains
where safe (the SSRF guard matches `host === entry` OR `host.endsWith('.' + entry)`, so a base
domain like `googleapis.com` also covers `oauth2.googleapis.com`). Distinct companies /
distinct registrable domains are kept separate.

**Totals:** 114 `BlockAuth.OAuth2` blocks. 110 resolve to a fixed, allowlistable token host
(→ 84 unique base-domain entries below). 4 blocks have a genuinely per-instance / user-supplied
token host and CANNOT be allowlisted (see last section).

## Env line (paste-ready)

> Note: `salesforce.com` covers the Salesforce block's user-entered `{environment}` domain
> (`login.salesforce.com`, `test.salesforce.com`, and any `*.my.salesforce.com` My Domain), so
> Salesforce IS allowlistable despite the templated host.

```
PROVIDER_HOST_ALLOWLIST=a.klaviyo.com,accounts.spotify.com,acuityscheduling.com,api.box.com,api.canva.com,api.capsulecrm.com,api.clicdata.com,api.clickup.com,api.dropboxapi.com,api.figma.com,api.freeagent.com,api.getresponse.com,api.helpscout.net,api.hubapi.com,api.instacharts.io,api.intercom.io,api.netlify.com,api.notion.com,api.pinterest.com,api.signnow.com,api.surveymonkey.com,api.typeform.com,api.vimeo.com,api.wootric.com,app.asana.com,app.baremetrics.com,app.teable.ai,auth.bexio.com,auth.gotenzo.com,auth.greenhouse.io,auth.mycase.com,auth.truelayer.com,auth.uc-technologies.com,auth.videoask.com,authz.constantcontact.com,cloud.digitalocean.com,cloudconvert.com,connect.squareup.com,fathom.video,focus.teamleader.eu,github.com,gitlab.com,graph.facebook.com,id.getharvest.com,id.twitch.tv,identity.xero.com,login.mailchimp.com,login.microsoftonline.com,login.microsoftonline.us,login.wrike.com,oauth.pipedrive.com,oauth.platform.intuit.com,oauth2.googleapis.com,openapi.niftypm.com,platform.hootsuite.com,podio.com,raindrop.io,salesforce.com,savvycal.com,services.leadconnectorhq.com,services.lightfunnels.com,simplyprint.io,slack.com,ticktick.com,todoist.com,webexapis.com,weekdone.com,www.formstack.com,www.linkedin.com,www.mindmeister.com,www.reddit.com,zoho.com,zoho.com.au,zoho.com.cn,zoho.eu,zoho.in,zoho.jp,zoho.sa,zohocloud.ca,zoom.us
```

## Host → block(s) audit table

| Host (allowlist entry) | Actual tokenUrl host(s) | Block(s) |
|---|---|---|
| a.klaviyo.com | a.klaviyo.com | klaviyo |
| accounts.spotify.com | accounts.spotify.com | spotify |
| acuityscheduling.com | acuityscheduling.com | acuity-scheduling |
| api.box.com | api.box.com | box |
| api.canva.com | api.canva.com | canva |
| api.capsulecrm.com | api.capsulecrm.com | capsule-crm |
| api.clicdata.com | api.clicdata.com | clicdata |
| api.clickup.com | api.clickup.com | clickup |
| api.dropboxapi.com | api.dropboxapi.com | dropbox |
| api.figma.com | api.figma.com | figma |
| api.freeagent.com | api.freeagent.com | free-agent |
| api.getresponse.com | api.getresponse.com | getresponse |
| api.helpscout.net | api.helpscout.net | help-scout |
| api.hubapi.com | api.hubapi.com | hubspot |
| api.instacharts.io | api.instacharts.io | insta-charts |
| api.intercom.io | api.intercom.io, api.eu.intercom.io, api.au.intercom.io (`{region}` = intercom/eu.intercom/au.intercom) | intercom |
| api.netlify.com | api.netlify.com | netlify |
| api.notion.com | api.notion.com | notion |
| api.pinterest.com | api.pinterest.com | pinterest |
| api.signnow.com | api.signnow.com | sign-now |
| api.surveymonkey.com | api.surveymonkey.com | surveymonkey |
| api.typeform.com | api.typeform.com | typeform |
| api.vimeo.com | api.vimeo.com | vimeo |
| api.wootric.com | api.wootric.com (`${WOOTRIC_API_URL}`) | wootric |
| app.asana.com | app.asana.com | asana |
| app.baremetrics.com | app.baremetrics.com | baremetrics |
| app.teable.ai | app.teable.ai | teable |
| auth.bexio.com | auth.bexio.com | bexio |
| auth.gotenzo.com | auth.gotenzo.com | tenzo |
| auth.greenhouse.io | auth.greenhouse.io | greenhouse |
| auth.mycase.com | auth.mycase.com | mycase-piece |
| auth.truelayer.com | auth.truelayer.com | truelayer |
| auth.uc-technologies.com | auth.uc-technologies.com | connectuc |
| auth.videoask.com | auth.videoask.com | videoask |
| authz.constantcontact.com | authz.constantcontact.com | constant-contact |
| cloud.digitalocean.com | cloud.digitalocean.com | digital-ocean |
| cloudconvert.com | cloudconvert.com | cloudconvert |
| connect.squareup.com | connect.squareup.com | square |
| fathom.video | fathom.video | fathom |
| focus.teamleader.eu | focus.teamleader.eu | teamleader |
| github.com | github.com | github |
| gitlab.com | gitlab.com | gitlab |
| graph.facebook.com | graph.facebook.com | facebook-pages, facebook-leads, instagram-business |
| id.getharvest.com | id.getharvest.com | harvest |
| id.twitch.tv | id.twitch.tv | twitch |
| identity.xero.com | identity.xero.com | xero |
| login.mailchimp.com | login.mailchimp.com | mailchimp |
| login.microsoftonline.com | login.microsoftonline.com (`{cloud}` default; `{tenantId}` = common) | azure-ad, microsoft-dynamics-crm, microsoft-copilot, microsoft-365-people, microsoft-dynamics-365-business-central, microsoft-power-bi, microsoft-365-planner, microsoft-onenote, microsoft-onedrive, microsoft-outlook, microsoft-outlook-calendar, microsoft-todo, microsoft-excel-365, microsoft-teams, microsoft-sharepoint |
| login.microsoftonline.us | login.microsoftonline.us (`{cloud}` GCC-High option) | (same 15 Microsoft blocks — US Government cloud) |
| login.wrike.com | login.wrike.com | wrike |
| oauth.pipedrive.com | oauth.pipedrive.com | pipedrive |
| oauth.platform.intuit.com | oauth.platform.intuit.com | quickbooks |
| oauth2.googleapis.com | oauth2.googleapis.com | youtube, google-contacts, google-forms, google-cloud-storage, google-sheets, google-drive, googlechat, google-calendar, google-search-console, google-docs, google-tasks, gmail, google-my-business, google-bigquery, google-slides |
| openapi.niftypm.com | openapi.niftypm.com | nifty |
| platform.hootsuite.com | platform.hootsuite.com | hootsuite |
| podio.com | podio.com | podio |
| raindrop.io | raindrop.io | raindrop |
| salesforce.com | login.salesforce.com / test.salesforce.com / *.my.salesforce.com (user-entered `{environment}`) | salesforce |
| savvycal.com | savvycal.com | savvycal |
| services.leadconnectorhq.com | services.leadconnectorhq.com | lead-connector |
| services.lightfunnels.com | services.lightfunnels.com | lightfunnels |
| simplyprint.io | simplyprint.io (`${BASE_URL.api}`) | simplyprint |
| slack.com | slack.com | slack |
| ticktick.com | ticktick.com | ticktick |
| todoist.com | todoist.com | todoist |
| webexapis.com | webexapis.com | webex |
| weekdone.com | weekdone.com | weekdone, week-done |
| www.formstack.com | www.formstack.com | formstack |
| www.linkedin.com | www.linkedin.com | linkedin |
| www.mindmeister.com | www.mindmeister.com | meistertask |
| www.reddit.com | www.reddit.com | reddit |
| zoho.com | accounts.zoho.com | zoho-mail, zoho-desk, zoho-crm, zoho-campaigns, zoho-books, zoho-bookings, zoho-invoice, bigin-by-zoho (`{location}`/`{region}`/`{domain}` US region) |
| zoho.com.au | accounts.zoho.com.au | (Zoho blocks — Australia region) |
| zoho.com.cn | accounts.zoho.com.cn | bigin-by-zoho (China region) |
| zoho.eu | accounts.zoho.eu | (Zoho blocks — Europe region) |
| zoho.in | accounts.zoho.in | (Zoho blocks — India region) |
| zoho.jp | accounts.zoho.jp | (Zoho blocks — Japan region) |
| zoho.sa | accounts.zoho.sa | bigin-by-zoho (Saudi Arabia region) |
| zohocloud.ca | accounts.zohocloud.ca | (Zoho blocks — Canada region) |
| zoom.us | zoom.us | zoom |

**Zoho note:** the six product blocks (`zoho-mail`, `zoho-desk`, `zoho-crm`, `zoho-campaigns`,
`zoho-books`, `zoho-bookings`) expose `zoho.com`, `zoho.eu`, `zoho.in`, `zoho.com.au`, `zoho.jp`,
`zohocloud.ca`. `zoho-invoice` exposes `com/eu/in/com.au/jp`. `bigin-by-zoho` additionally exposes
`zoho.com.cn` (China) and `zoho.sa` (Saudi Arabia). All eight registrable base domains are listed so
every region's `accounts.<domain>` token host is covered. These are all Zoho-owned regional TLDs —
`zoho.com`, `zoho.com.au`, `zoho.com.cn` are separate registrable domains (a `.zoho.com` suffix does
NOT match `accounts.zoho.com.au`), which is why each is a distinct entry.

## Cannot be allowlisted (per-instance / dynamic host)

These `BlockAuth.OAuth2` blocks POST to a token host that is the customer's own instance, a
self-hosted server, or a value the end user types in. There is no fixed provider host to allowlist.
**Enabling a strict `PROVIDER_HOST_ALLOWLIST` will reject these blocks' token exchange (reason
`host-not-allowlisted`) unless the specific host is added at connection time.**

| Block | tokenUrl template | Why per-instance |
|---|---|---|
| gitea | `{baseUrl}/login/oauth/access_token` | Self-hosted Gitea; OAuth app + host live in the user's own instance. |
| workday | `https://{apiHost}/ccx/oauth2/{tenant}/token` | Each customer's own Workday tenant + API host. |
| snowflake | `https://{account}.snowflakecomputing.com/oauth/token-request` | Per-account host `<account>.snowflakecomputing.com`. Could be partially bounded by adding `snowflakecomputing.com`, but the account subdomain is customer-specific and this base domain is intentionally NOT in the list above. |
| http-oauth2 | `{tokenUrl}` | Fully generic connector; user supplies the entire token URL. |

> Not in scope (not `BlockAuth.OAuth2`, so not guarded by this list, but noted for completeness):
> `coupa` uses `BlockAuth.CustomAuth` and performs a client-credentials exchange to
> `https://{instanceUrl}/oauth2/token` (per-customer Coupa host, e.g. `acme.coupahost.com`);
> `medullar` declares an `authUrl` API base but is token/SecretText auth, not OAuth2.
