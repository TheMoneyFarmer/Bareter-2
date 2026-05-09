# Search Console submission — launch checklist

This is the founder-run checklist for Task #205: verifying `bareter.com` in
Google Search Console (GSC) and Bing Webmaster Tools, then submitting
`/sitemap.xml` so listings appear in organic search results.

The audit artifact for this task is
[`launch-evidence/search-console.md`](launch-evidence/search-console.md).
Fill it in and commit it once every step below is green.

---

## 1. Google Search Console — verify ownership

1. **Open GSC.** Go to <https://search.google.com/search-console/> and sign in
   with the founder Google account.

2. **Add a property.** Click *Add property* → choose **URL prefix** →
   enter `https://bareter.com` → click *Continue*.

3. **Choose the HTML-file verification method.**
   - In the verification dialog, expand *Other verification methods* →
     select **HTML file**.
   - GSC will show you a filename like `googleXXXXXXXXXXXXXXXX.html`.
   - Copy the **verification code** — it's the long hex string between
     `google` and `.html` in the filename.

4. **Set the Replit secret.**
   - Open the Replit *Secrets* pane (lock icon in the left sidebar).
   - Add a secret: **Name** = `GOOGLE_SITE_VERIFICATION`, **Value** = the
     hex code you just copied (e.g. `abc123def456…`).
   - The server now serves the verification file automatically at
     `https://bareter.com/googleXXXXXXXXXXXXXXXX.html`.

5. **Re-deploy** so the new secret is live in production
   (*Publishing → Deploy*).

6. **Confirm the file is reachable.** In a new browser tab, open:
   ```
   https://bareter.com/google<YOUR_CODE>.html
   ```
   The page must return:
   ```
   google-site-verification: google<YOUR_CODE>.html
   ```

7. **Add the meta-tag secret (optional but recommended as a backup method).**
   - Add another secret: **Name** = `VITE_GOOGLE_SITE_VERIFICATION`,
     **Value** = the same hex code.
   - This injects `<meta name="google-site-verification" content="…">` into
     every page at build time. It kicks in on the next deploy.

8. **Click *Verify* in GSC.** GSC fetches the HTML file and flips the
   property to *Verified*.

9. **Add the `www` variant.** Repeat steps 2–8 for `https://www.bareter.com`
   (once that CNAME is resolved — see Task #154). GSC treats apex and www as
   separate properties; verify both so you get data for either entry point.

---

## 2. Submit the sitemap in GSC

1. In the left sidebar of GSC, click **Sitemaps** (under *Indexing*).
2. In the *Add a new sitemap* field, paste:
   ```
   https://bareter.com/sitemap.xml
   ```
3. Click *Submit*.
4. Wait up to 24 h for GSC to crawl and parse the sitemap. The *Status*
   column will change from *Pending* to *Success* (or flag any errors).

Expected result: **Success**, with the URL count matching what
`https://bareter.com/sitemap.xml` actually contains (≥ 7 static pages +
all approved active listings).

---

## 3. Confirm robots.txt is valid in GSC

1. In GSC left sidebar, go to **Settings → robots.txt**.
   (Or use the legacy tool: <https://search.google.com/search-console/robots-testing-tool>
   and enter `https://bareter.com/robots.txt`.)
2. Verify the file content shows:
   ```
   User-agent: *
   Allow: /
   Disallow: /admin
   Disallow: /api/
   
   Sitemap: https://bareter.com/sitemap.xml
   ```
3. Confirm GSC shows **no errors**.

---

## 4. Bing Webmaster Tools (bonus)

1. Open <https://www.bing.com/webmasters> and sign in with a Microsoft
   account.

2. **Add your site.** Click *Add a site* → enter `https://bareter.com`.

3. **Choose the XML sitemap auto-detect method (easiest).**
   - Bing will ask whether you want to import from Google Search Console.
   - If GSC is already verified, click **Import from Google Search Console**
     → authenticate → select the `bareter.com` property. Bing imports the
     sitemap URL automatically — you are done.

4. **Or verify manually:**
   - Choose *XML file verification* → download the `BingSiteAuth.xml` file.
   - Upload it to `client/public/BingSiteAuth.xml` in the repo, then
     re-deploy so it's reachable at `https://bareter.com/BingSiteAuth.xml`.
   - Click *Verify* in Bing.
   - Optionally set the secret **Name** = `VITE_BING_SITE_VERIFICATION`,
     **Value** = the `content` value from the Bing meta-tag method; this
     injects `<meta name="msvalidate.01" content="…">` on every page.

5. **Submit the sitemap** in Bing Webmaster → *Sitemaps* → *Submit sitemap* →
   `https://bareter.com/sitemap.xml`.

---

## 5. Recurring quarterly check

Set a quarterly reminder titled
**"Bareter: quarterly GSC + Bing indexing check"** to:

- [ ] GSC *Coverage* report — no spike in *Excluded* or *Error* URLs.
- [ ] GSC *Sitemaps* — Status still *Success*, URL count still matches live
      listing count.
- [ ] Bing *Index Explorer* — no unexpected *Blocked* pages.
- [ ] robots.txt still correct (no deployment changed it unintentionally).

---

## 6. Incident playbook

| Symptom | Fix |
| ------- | --- |
| GSC shows "Couldn't fetch" for sitemap | Check `https://bareter.com/sitemap.xml` is publicly reachable; verify `APP_BASE_URL` is set in production secrets |
| GSC property flips to *Unverified* | Re-verify: the HTML-file route is served as long as `GOOGLE_SITE_VERIFICATION` secret is set and the deployment is live |
| robots.txt shows wrong `Sitemap:` URL | Ensure `APP_BASE_URL=https://bareter.com` is set in production secrets |
| Sitemap URL count drops unexpectedly | Check that listings haven't been bulk-deactivated or rejected via admin moderation |
