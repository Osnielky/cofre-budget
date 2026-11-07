/* Housekeeping that used to run inside onApplicationBootstrap / onModuleInit
   (demo sandbox sweep, page-view sweep, screenshot sweep, AI purge) now starts
   this long after boot. Nest awaits those hooks before app.listen(), so on
   Cloud Run, which scales to zero, every cold start paid for all of them before
   the first request got an answer. The timers are unref'd so they never keep a
   process alive, and with CPU allocated only during requests they simply run
   while the first requests are being served. */
export const BOOT_SWEEP_DELAY_MS = 15_000;
