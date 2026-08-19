import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://blog-b0i.pages.dev/",
    title: "Mniej szumu",
    description: "Zapisuję własne myśli w świecie AI slopu.",
    author: "Paweł Halas",
    profile: "https://www.linkedin.com/in/pawel-halas-1b921264",
    ogImage: "default-og.jpg",
    lang: "pl",
    timezone: "Europe/Warsaw",
    dir: "ltr",
  },
  posts: {
    perPage: 4,
    perIndex: 4,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    // Off: archives duplicates /posts. The page self-rewrites to 404, the
    // sitemap filter drops it, and the nav item hides. Flip back to restore.
    showArchives: false,
    showBackButton: true,
    editPost: {
      enabled: false,
    },
    search: "pagefind",
  },
  socials: [
    { name: "linkedin",   url: "https://www.linkedin.com/in/pawel-halas-1b921264" },
    { name: "instagram",  url: "https://www.instagram.com/pawelxhalas/" },
    { name: "letterboxd", url: "https://letterboxd.com/pawelxhalas/" },
    { name: "mail",       url: "mailto:p.l.halas@gmail.com" },
  ],
  // The one place the share platforms are defined. Both the /posts dropdown
  // and the in-post icon row read this list, so they cannot drift apart.
  // Copy-link is not here: it is not a URL, and it is rendered alongside.
  // Instagram is absent because it exposes no web share endpoint at all.
  shareLinks: [
    { name: "x",        url: "https://x.com/intent/post?url=" },
    { name: "linkedin", url: "https://www.linkedin.com/sharing/share-offsite/?url=" },
    { name: "facebook", url: "https://www.facebook.com/sharer.php?u=" },
  ],
});