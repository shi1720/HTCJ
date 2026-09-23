# GroundProof — verbatim voiceover and recording guide

Runtime: **3 minutes 30 seconds**. Narration: **436 words**, approximately 125 words per minute. Read the quoted text exactly. Record your voice against the supplied silent video; the separate SRT matches this script. Timing allows natural pauses.

The video shows the actual application at 1440 × 900. All demonstration jobs and notice changes are fictional and labeled. The Boston capture is genuinely retrieved through Anakin during recording. No account password or API key appears.

## 00:00–00:24 · Yesterday’s approval. Today’s reality.

> I'm Shivam Gupta, and this is GroundProof. A drone inspection job can be approved yesterday and still depend on information that changes today. A site closes. A document expires. A required source stops responding. GroundProof connects every internal approval to the exact evidence behind it, so a changed fact cannot hide behind an old green status.

Screen action: Show the landing page, then enter a fresh isolated demonstration workspace at 00:12.

## 00:24–00:46 · Evidence behind the decision

> These are six fictional inspection jobs. This mission depends on the Harbor Works access notice. We preserve the source text, capture time, and content hash. A reviewer accepts this exact version. The mission signoff records those same hashes, giving us a concrete answer to what someone approved, and when.

Screen action: Open the mission board, the facade inspection, and its Harbor Works access notice. Show captured text, timestamp, and content hash.

## 00:46–01:09 · One changed source. Three affected jobs.

> Now I'll run a simulated closure. Three jobs depend on this source. GroundProof identifies those jobs and invalidates their earlier approval. Their combined booked value is forty-eight hundred dollars in this demonstration. That is affected work, not claimed savings. The remaining jobs keep their own evidence state.

Screen action: Simulate the site closure, show the three affected jobs and $4,800 booked value, then return to the mission board.

## 01:09–01:34 · A human decision on a specific version

> The coordinator can inspect what changed and record a decision. GroundProof does not ask a language model whether a flight is safe. Deterministic checks enforce the workflow. Missing, stale, blocked, or unavailable evidence prevents approval. An open review cannot silently approve a source version that changed while someone was reading it.

Screen action: Show disabled signoff and the changed source. Compare previous and current text. Record a hold with an explanatory note.

## 01:34–02:03 · Review again. Then approve again.

> I'll restore the demonstration notice and review the current evidence. That review alone does not revive the old mission approval. I must approve the mission again against the latest version. Every step appears in the audit history, with the person and time attached. Operator-supplied permission records also support declared expiry, checked against the scheduled mission time.

Screen action: Restore an updated demonstration notice in the proof lab. Accept the source, then separately sign off one mission. Show the audit trail.

## 02:03–02:33 · A portable record, and a visible failure

> For a completed review, the exported evidence bundle preserves the referenced versions and an integrity manifest. Another person can verify whether that bundle has changed. A hash proves integrity, not that the source itself is true. A source failure is visible too. GroundProof keeps the previous snapshot for investigation, but holds the dependent work.

Screen action: Export the completed mission decision packet. Then inject a source failure and inspect the retained snapshot and hold state.

## 02:33–03:04 · Rules you can test. Sources you can trace.

> The proof lab runs authored failure scenarios through the actual evidence rules. Here are the results. Now I am capturing an official Boston source through the Anakin web API. The provider, timestamp, text, and hash are preserved. This is a live capture, separate from the simulated notice changes. Direct public-source retrieval is also available, with its own provenance.

Screen action: Run the proof lab and show the actual 15/15 outcome. Add the official Boston filming page, select Anakin, capture it, and show the genuine Anakin provenance and public-source text.

## 03:04–03:30 · A practical first customer and pilot

> We're building for drone inspection operators coordinating repeated work across multiple sites. Our proposed starting price is one hundred ninety-nine dollars per month. These savings inputs are assumptions to test. We seek one operator for a four-week shadow pilot to measure review time and useful change detection. GroundProof manages evidence and internal approval. The remote pilot remains responsible for flight decisions. Yesterday's approval. Today's evidence.

Screen action: Open Workspace settings and show the commercial calculator, explicitly proposed $199 price, and planning-assumption disclosure.

## How to finish

1. Import groundproof-demo-silent.mp4 into your preferred video editor.
2. Record the narration one segment at a time, matching the timestamps above. Keep brief pauses at sentence boundaries.
3. Import groundproof-demo-captions.srt as an optional subtitle track. These captions represent the supplied narration; keep them only if you read this version.
4. Export MP4 with H.264 video and AAC audio. Check that the first and last words are audible and no private tabs or notifications were added.
5. Upload the completed video to your chosen hosting service and place the public viewing link in the submission.

## Reproduce the silent screencast

Run npm start, then node scripts/record-demo.mjs --url=http://localhost:3001. A successful Anakin capture requires server-side provider availability. The recorder stops if live evidence cannot be captured; it never substitutes fixtures or relabels another provider. Use --rehearse for an accelerated UI check, and --write-assets-only to regenerate this guide and captions without recording.

## Submission video description

GroundProof by Shivam Gupta. Working operational evidence management software for drone inspection teams, demonstrated with fictional jobs and explicit source-change simulations. Includes current-version review, approval invalidation, failure handling, operator-supplied records with expiry, audit history, verifiable evidence export, and genuine Anakin public-page capture. AI-assisted development. Commercial assumptions and proposed pilot are unvalidated. This application does not authorize or control flights.
