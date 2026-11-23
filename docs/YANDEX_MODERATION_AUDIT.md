# Yandex Games moderation audit

**Audit date:** 2026-11-21  
**Scope:** repository-level review against the current public requirements, not a certification or guarantee of moderation approval.

Primary source: https://yandex.ru/dev/games/doc/ru/concepts/requirements  
Details checked: https://yandex.ru/dev/games/doc/ru/requirements/1/6

## Findings and code work

| Requirement | Current observation / action | Status |
|---|---|---|
| 1.6.1.6 / 1.6.2.5 — no browser system media player | Music had been played via `new Audio(...)`; SFX had an HTMLAudio fallback; boot also created a silent HTMLAudio element. Replaced music playback with fetched/decoded AudioBuffers and Web Audio sources; removed HTMLAudio fallback and silent media warm-up. User confirmed the system player is not visible during the current PC/browser test. | PC/browser check confirmed by user; mobile check still required |
| 1.6.2.2 — desktop active area aspect ratio | `js/ui/ui_scale.js` scales the scene to 1366×768 proportions (1.78:1), below the 2:1 maximum. | Code appears compliant; test actual portal container / sticky banner layout |
| 1.10.1 / 1.10.3 — no clipping or overlap on resize/orientation | Main scene is scaled to the viewport; achievement-detail overlay was changed to be scene-bounded. | Partial; broad manual viewport/orientation check remains |
| 1.14 — no technical errors or freezes | Smoke suite covers a selection of menu/game flows, not the full range of platform lifecycle, ad, gesture, browser-history, and device cases. | Not fully verified |
| 1.19.2 — `LoadingAPI.ready()` when playable | Boot calls `ysdk.gameReady()` after menu setup and render warm-up. | Code path present; verify in real SDK container |
| 1.19.3 / pause and resume | `GameplayAPI` and SDK pause/resume handlers are present in `js/app.js` and `js/sdk/yandex_sdk.js`. | Requires real-container event verification |
| 4.1 / 4.7 — ads through Yandex SDK; gameplay/audio pause during fullscreen ads | Ad wrappers use SDK methods; app pauses/resumes gameplay and audio from ad callbacks. | Code path present; verify real interstitial/rewarded callbacks and restoration |
| 8.4.2 — no external resource links | An external attribution hyperlink was found in the About/credits UI and changed to plain text. | Code link removed; inspect final UI/content |
| 1.22 — archive root has `index.html`, names use supported characters | Repository has root `index.html`; archive export itself is a Console operation. | Verify uploaded archive, not just checkout |

## Not decidable from source alone

These require the Yandex Games Console, the final archive, or moderation-device testing and are not marked compliant by this audit:

- Supported platforms/orientation selection and matching device coverage (1.6, 1.20).
- Console metadata: title consistency and uniqueness, description, instructions, genre, age rating, icon, cover, screenshots, tags, version, archive (2.2–2.3, 5.1–5.4, 5.12).
- Whether cloud saves or in-app purchases are enabled in the draft and match implementation (1.11, 1.13).
- Commercial/licensing rights and content suitability of all art/audio and promotional materials (3.5, 8.2–8.3).
- Product rating after publication (2.13), plus whether the game meets platform quality/retention expectations (2.1, 2.8–2.9).
- Real-device/browser checks: notification shade, browser system player, swipe-to-refresh, long press, orientation changes, focus loss, ads, browser back/history, touch and keyboard/mouse behavior (1.3, 1.6, 1.10, 1.14, 1.20).

## Required follow-up verification

1. Run smoke and static checks after the audio migration.
2. Test the game on Android/Chrome and desktop Chrome with system media controls enabled. During game music playback, verify the notification shade/browser media UI does not list this game; verify music still stops/resumes correctly on focus loss, SDK pause/resume, and ads.
3. Check scene clipping and orientation changes on actual narrow/wide viewports; the scene and every modal must remain inside its 1366:768 frame, with letterbox areas outside it.
4. Test interstitial and rewarded ads in the real Yandex SDK container, including close/error/offline paths and gameplay restoration.
5. Verify every Console-draft field and the uploaded archive independently. Do not infer those settings from this repository.
