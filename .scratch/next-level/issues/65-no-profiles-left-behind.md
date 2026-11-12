# No browser profiles left behind

Status: resolved

Release: v2.187.13

Spec: `../spec.md`

On 2026-11-12, during a loop pass, the C: drive filled to 0 bytes free. The temp directory held 1,740 `duty-chrome-*` profiles from scripted runs, 37 GB in all.

`launchChrome()` makes a throwaway profile for every run and deletes it in `close()`. It killed Chrome and waited a fixed half second. Chrome and its children were often still holding files in the profile then, so the delete failed, and the error was swallowed. A script that died before `close()` didn't try at all.

## Comments

- `close()` now waits for Chrome to exit (at most 5 s), then deletes the profile with 10 retries 200 ms apart.
- Every launch also clears, in the background, any `duty-chrome-*`, `duty-perf-*` or `duty-measure-*` profile in the temp directory older than six hours. Those are what a crashed script leaves behind. Six hours keeps clear of any run still going.
- The old profiles were cleared by hand. They were throwaways their scripts had meant to delete; only those older than an hour went. C: went from 0 to 184 GB free.

Verified: three launches and closes in a row left the count of `duty-chrome-*` directories unchanged (16 before, 16 after, all from the last hour).
