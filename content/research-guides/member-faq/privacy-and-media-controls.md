---
title: Privacy and Media Controls FAQ
type: member-faq
status: draft
owner: Samuel Boadu (founder reviewer and publisher)
last_reviewed: 2026-07-19
---

# Privacy and Media Controls

Member education. This file is an AI draft at workflow state `draft`. Nothing here is approved,
published, or member-visible until Samuel Boadu reviews and publishes it.

Members send progress photos, voice notes, and short exercise video. That is sensitive material, and
this page describes what happens to it, what you control, and which of these controls are built
versus committed. Where something is not yet operating, this page says so rather than describing the
intended design in the present tense.

---

## What media can I send, and what are the limits?

Three kinds.

**Progress photos.** Still images you submit to track change over time.

**Voice notes.** Up to 60 seconds each. The limit is not arbitrary. A 60 second cap keeps a voice
note to a single question or a single update, which is what gets processed accurately, and it keeps
the volume of sensitive audio held on your behalf small.

**Exercise video.** Short clips of a movement, for form context. The same principle applies: short
enough to show one thing, not long enough to become a general recording of your home or your day.

Send the smallest thing that carries the point. Every additional frame and second is additional
sensitive data that then has to be protected, and the least risky data is the data that was never
collected.

## What happens to a progress photo after I send it?

It is processed, the derived information is retained, and the original file is deleted after
processing completes successfully.

"Successfully" is doing real work in that sentence. Raw media is not deleted on a timer regardless of
outcome, because deleting the original of a failed process would destroy your submission and leave
you with nothing. Deletion is tied to a confirmed successful processing result. If processing fails,
the raw file persists until the failure is resolved or you delete it.

What survives is the derived record: the structured observations, timestamps, and notes that make
the photo useful across time. The image file itself is not kept as a permanent archive.

[UNVERIFIED - background knowledge, requires human source check] The maximum window a raw file may
persist before deletion, the handling and retention of backup copies, and whether deletion is
verified and logged per file are NOT CONFIRMED and must be settled with the privacy owner before
this answer publishes.

## Is face blur available, and is it on by default?

Face blur is offered as an option on progress photos. It is a member choice, not a default and not a
requirement.

It is optional on purpose. Some members want their face out of every image they send, and some
consider a blurred face to be a loss of context they would rather keep. Neither position is wrong,
and forcing either one would be a worse design than letting you decide per submission.

If you are unsure, blur. It is easier to send a clearer image later than to unsend one.

[UNVERIFIED - background knowledge, requires human source check] Whether face blur is applied on
your device before upload or after the file arrives is NOT CONFIRMED, and the difference is
material. Blur applied before upload means the unblurred image never leaves your device. Blur
applied after upload means the unblurred image existed on a server before being processed. This
answer must not publish until the actual behavior is confirmed and stated plainly.

## Who can see my media?

Access is limited to the people operating Xenios Research who need it to respond to your submission,
and to the systems that process it on their behalf.

Your media is not shown to other members, is not used in marketing, is not published, and is not
used as an example in any member-facing surface. There is no gallery, no before-and-after feature,
and no sharing surface that could put your image in front of another member.

[UNVERIFIED - background knowledge, requires human source check] The named individuals or roles with
access, whether access is logged per view, and the complete list of third party processors that
touch member media are NOT CONFIRMED. A privacy answer that lists no processors is incomplete, and
this section needs the actual processor list before it publishes.

## Why is raw media deleted at all, if the derived record is kept?

Because the raw file is the highest-risk object in the system and the least necessary one to keep.

An original photo or voice recording of you is directly identifying. The derived record, in most
cases, is not identifying in the same way and is what actually serves you over months. Keeping the
smaller, less sensitive object and discarding the larger, more sensitive one after it has done its
job is the right trade.

The uncomfortable consequence, stated plainly: you cannot ask for a copy of a raw file that has
already been deleted. It is gone, not archived somewhere retrievable. If you want your own copy of a
photo or clip, keep it on your own device before you send it. Deletion is a feature and it is not
reversible.

## Can I delete my media myself, before or after processing?

You should be able to delete your own media on request, and the intent is that deletion is a member
control rather than a support favour.

Honest current state: member-facing self-service deletion of submitted media is committed and is not
described here as shipped. Related work in the same area, including self-service account controls, is
on the required-changes list rather than the completed list as of 2026-07-19. Until self-service
deletion is live, deletion runs through the member question channel, and that means it takes time
rather than being immediate.

If a Xenios Research page describes instant self-service media deletion as though it exists today,
that copy is running ahead of the implementation and it is being corrected rather than defended.

## What happens to my data if I cancel?

Cancellation ends your access. It does not end your rights over your own data.

After cancellation you retain the right to request a copy of the personal data held about you, the
right to request correction of data that is wrong, and the right to request deletion. Those rights do
not lapse because your subscription did, and exercising them does not require an active membership.

Two limits worth knowing in advance. Raw media already deleted after successful processing cannot be
returned to you, because it no longer exists. And some records may be retained where retention is
legally required, for example records relating to payments or to identity and age verification.
Those retained records are not used to keep serving you content, and they are not a way of keeping
you as a member.

[UNVERIFIED - background knowledge, requires human source check] The retention period for each
category after cancellation, the response time for a data request, the identity check required
before a request is fulfilled, and the specific legal basis for each retained category are NOT
CONFIRMED. These must be settled with counsel and the privacy owner before this answer publishes,
and they should not be estimated in the meantime.

## Is my media used to train anything?

Member media is not sent to any surface where it could be published, and it is not used as marketing
or example content.

[UNVERIFIED - background knowledge, requires human source check] Whether any processing vendor in the
pipeline retains member media for its own model training, and what contractual terms exclude that,
are NOT CONFIRMED. This is the single question members are most likely to care about in this file,
and it is better to leave it explicitly open than to answer it with an assumption. It must be
answered from the actual processor agreements before this page publishes.

## What is honestly not built yet?

As of 2026-07-19, the following are committed rather than confirmed operating: member self-service
media deletion, self-service account controls including cancellation, member multi-factor
authentication, device-session visibility, and session revocation. An internal security review of the
current codebase records those as required changes rather than shipped features.

The processor list, the raw media deletion window and its verification, the pre-upload versus
post-upload behavior of face blur, and post-cancellation retention periods are all NOT CONFIRMED and
are marked as such above rather than filled in.

If the state of these controls is the deciding factor in whether you are comfortable sending photos
or voice, send less until they are confirmed. That is a reasonable response to an accurate
description, and the description is not going to be softened to prevent it.
