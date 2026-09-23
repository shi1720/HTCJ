# GroundProof: verbatim voiceover and recording guide

Runtime: **3 minutes 30 seconds**. Narration: **404 words** with deliberate pauses to inspect the interface. The completed video uses an explicitly disclosed AI narrator. The separate SRT is aligned to the spoken audio with word timestamps. All screen footage comes from the running application.

The video shows the actual application at 1440 × 900. Demonstration jobs and notice changes are fictional and labeled. The Boston capture is genuinely retrieved through Anakin during recording. No password, recovery key, or API key appears.

## 00:00 to 00:24 · Yesterday’s approval. Today’s reality.

> A drone can be ready while the job is not. A crew arrives, but site access changed overnight. Yesterday's approval still looks complete. GroundProof, built by Shivam Gupta, connects each inspection job to the evidence behind it, and flags the jobs that need a fresh human decision.

Screen action: Show the landing page, then enter a fresh isolated demonstration workspace at 00:12.

## 00:24 to 00:46 · Evidence behind the decision

> Here are six fictional inspection jobs across three sites. Open one job to see the access notice, checklist, and insurance evidence it depends on. GroundProof records exactly what was reviewed, when it was captured, and which version the person approved. Each signoff has a specific set of supporting evidence.

Screen action: Open the mission board, the facade inspection, and its Harbor Works access notice. Show captured text, timestamp, and content hash.

## 00:46 to 01:09 · One changed source. Three affected jobs.

> Now a simulated site closure changes one notice. Exactly three jobs lose their previous approval. Their combined planned job value is forty-eight hundred dollars in this example. That is the work affected by the change, not a savings claim. The other three jobs keep their own evidence state.

Screen action: Simulate the site closure, show the three affected jobs and $4,800 booked value, then return to the mission board.

## 01:09 to 01:34 · A human decision on a specific version

> An old signoff cannot be reused. The coordinator sees the earlier notice beside the current one, explains the decision, and keeps the jobs on hold. Missing, expired, blocked, or unavailable evidence also prevents signoff. These checks follow explicit rules. A language model does not decide whether an aircraft may fly.

Screen action: Show disabled signoff and the changed source. Compare previous and current text. Record a hold with an explanatory note.

## 01:34 to 02:03 · Review again. Then approve again.

> Next, restore the notice and accept the current evidence. Notice what does not happen: the old mission approval stays revoked. The coordinator must separately review and sign off this job again. The audit records each step. Operator-supplied permission records can also have an expiry date, checked against the planned job time.

Screen action: Restore an updated demonstration notice in the proof lab. Accept the source, then separately sign off one mission. Show the audit trail.

## 02:03 to 02:33 · A portable record, and a visible failure

> The decision packet preserves the exact evidence behind that fresh signoff. It includes an integrity check that can be verified outside the app. That checks the recorded content, not whether a document is genuine. Now a source fails. GroundProof keeps the last snapshot visible for investigation and holds the dependent work.

Screen action: Export the completed mission decision packet. Then inject a source failure and inspect the retained snapshot and hold state.

## 02:33 to 03:04 · Rules you can test. Sources you can trace.

> The proof lab runs fifteen scenarios through the same evidence rules used by the application. Here are the actual results. Now we capture an official Boston page through Anakin. The source text, provider, time, and hash are recorded. This is a real web capture, separate from the fictional site-closure drill.

Screen action: Run the proof lab and show the actual 15/15 outcome. Add the official Boston filming page, select Anakin, capture it, and show the genuine Anakin provenance and public-source text.

## 03:04 to 03:30 · A practical first customer and pilot

> Our first target customer is a drone inspection operator coordinating repeat work across multiple sites. We propose one hundred ninety-nine dollars per month, then test that price against actual review time and useful alerts. We seek one operator for a four-week shadow pilot. GroundProof keeps internal approvals tied to current evidence. Flight decisions stay with the remote pilot.

Screen action: Open Workspace settings and show the commercial calculator, explicitly proposed $199 price, and planning-assumption disclosure.

## Reproduce the video

1. Run the application, then node scripts/record-demo.mjs --url=https://groundproof-flight.web.app. Set DEMO_OUTPUT_DIR to choose the output directory. A successful live Anakin capture is required; the recorder never substitutes fixtures or changes provider labels.
2. Set OPENAI_API_KEY_FILE to a private local file outside the repository, then run node scripts/narrate-demo.mjs. The key never enters product footage or deliverables.
3. Run node scripts/align-demo-narration.mjs with the same output directory. This replaces draft subtitle timing with timestamps from the actual audio.
4. Run node scripts/caption-demo.mjs, then mux the captioned footage and work/media/groundproof-narration.wav with H.264 video and AAC audio. Inspect exported frames, transcript, duration, and audio loudness.
5. Upload groundproof-demo-narrated.mp4. Keep the AI voice disclosure and the distinction between fictional drills and real public-page capture.

Use --rehearse for an accelerated UI check and --write-assets-only to regenerate the guide and draft captions without recording. Draft captions are not the final speech-aligned track.

## Credit and scope

GroundProof by Shivam Gupta, built with AI-assisted development. Narrator generated using OpenAI text to speech; it is not a clone of Shivam or another person. Proposed pricing and pilot assumptions are unvalidated. The application manages internal evidence decisions and does not authorize or control flights.
