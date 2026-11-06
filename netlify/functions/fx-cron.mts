// Netlify scheduled function: daily FX refresh (replaces vercel.json cron). 03:15 UTC.
export default async () => {
  const base = process.env.URL; // Netlify sets this to the site's primary URL
  if (!base || !process.env.CRON_SECRET) {
    console.error("fx-cron: URL or CRON_SECRET missing");
    return;
  }
  const res = await fetch(`${base}/api/cron/fx`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  console.log("fx-cron:", res.status);
};

export const config = { schedule: "15 3 * * *" };
