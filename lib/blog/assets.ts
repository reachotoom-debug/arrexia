/** Blog image paths under /public/blog — swap files without code changes. */
export const BLOG_IMAGES = {
  overdueInvoices: {
    cover: "/blog/overdue-invoice-relationships.png",
    inline: "/blog/overdue-invoice-inline.png",
  },
  reminderEmails: {
    cover: "/blog/invoice-reminder-best-practices.png",
    inline: "/blog/invoice-reminder-inline.png",
  },
  arAutomation: {
    cover: "/blog/accounts-receivable-automation.png",
    inline: "/blog/accounts-receivable-automation-inline.png",
  },
} as const;

export const BLOG_COVER_WIDTH = 1200;
export const BLOG_COVER_HEIGHT = 630;
export const BLOG_INLINE_WIDTH = 1200;
export const BLOG_INLINE_HEIGHT = 675;

export const DEFAULT_AUTHOR_AVATAR = "/authors/mohammed-otoom.png";
