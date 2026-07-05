/** Blog image paths under /public/blog — swap files without code changes. */
export const BLOG_IMAGES = {
  overdueInvoices: {
    cover: "/blog/overdue-invoices-cover.png",
    inline: "/blog/overdue-invoices-inline.png",
  },
  reminderEmails: {
    cover: "/blog/reminder-emails-cover.png",
    inline: "/blog/reminder-emails-inline.png",
  },
  arAutomation: {
    cover: "/blog/ar-automation-cover.png",
    inline: "/blog/ar-automation-inline.png",
  },
} as const;

export const BLOG_COVER_WIDTH = 1200;
export const BLOG_COVER_HEIGHT = 630;
export const BLOG_INLINE_WIDTH = 1200;
export const BLOG_INLINE_HEIGHT = 675;

export const DEFAULT_AUTHOR_AVATAR = "/authors/mohammed-otoom.png";
