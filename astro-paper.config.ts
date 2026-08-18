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
  shareLinks: [
    { name: "whatsapp", url: "https://wa.me/?text=" },
    { name: "facebook", url: "https://www.facebook.com/sharer.php?u=" },
    { name: "x",        url: "https://x.com/intent/post?url=" },
    { name: "telegram", url: "https://t.me/share/url?url=" },
    { name: "pinterest", url: "https://pinterest.com/pin/create/button/?url=" },
    { name: "mail",     url: "mailto:?subject=See%20this%20post&body=" },
  ],
});