# Leadrat leads on Hostinger

Every enquiry popup and the homepage form send leads to Leadrat, tagged with the
project. The browser never sees the Leadrat API key.

```
visitor's browser ──POST /api/lead.php──▶ your site (relay adds the key) ──▶ Leadrat
```

What Leadrat receives for each lead:

| Leadrat field      | Value                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| Name, phone, email | From the form (phone as 10 digits, country code 91)                            |
| Project            | e.g. `M3M Franck Muller Sector 43 Gurgaon` (no commas: Leadrat splits on them) |
| Source             | Website (set by Leadrat's Website integration)                                 |
| Sub-source         | `Landing page: <project-slug>`                                                 |
| Location           | The project's sector, Gurugram, Haryana                                        |
| Notes              | Project, which button opened the form, page, consent version                   |
| Extra fields       | FormIntent, LandingPage, ProjectSlug, WebsiteLeadId, UTM tags                  |

## Local testing

1. `.env` (git-ignored) holds `PUBLIC_CRM_LEAD_URL=/api/lead.php` and `LEADRAT_API_KEY=...`.
2. `npm run dev`, open a project page, submit the popup. The terminal prints
   `[lead relay] 200 ...` and the lead appears in Leadrat > Leads > Manage Leads.
3. Local submissions are REAL leads. Use a name starting with "TEST" and delete them after.

Automated tests (`npm test`, `npx playwright test`) use a fake CRM and never reach Leadrat.

## Going live on Hostinger (once)

1. `npm run build` (with `.env` as above), then upload everything inside `dist/`
   to `public_html/`. This includes `api/lead.php`, `api/lead-projects.json` and `api/.htaccess`.
2. In Hostinger File Manager, open the folder ABOVE `public_html` (your home folder).
   Create `leadrat-config.php` there from `public_html/api/leadrat-config.example.php`
   and paste the API key:
   ```php
   <?php
   return [
       'api_key' => 'YOUR-LEADRAT-API-KEY',
       'api_url' => 'https://connect.leadrat.com/api/v1/integration/Website',
   ];
   ```
   Never put this file inside `public_html`.
3. Make sure the site uses PHP 8 (Hostinger > Advanced > PHP Configuration).
4. Submit one test enquiry on the live site and check Manage Leads.

## Notes

- New project pages are added to the allowlist automatically on the next build.
- Spam protection: hidden honeypot field, 3-second minimum fill time, same-site
  check, and at most 6 leads per visitor IP per 10 minutes.
- If Leadrat rejects a lead, the visitor sees the form's error message with a
  retry button and the WhatsApp/call options; nothing is lost silently.
- To rotate the key: create a new one in Leadrat, update `.env` locally and
  `leadrat-config.php` on Hostinger. No rebuild is needed for the server side.
