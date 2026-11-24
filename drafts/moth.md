# The Moth: draft copy

Draft 2, Oct 5, 2026. Claude drafted; Sonya edited. These lines are now in the content files.

Edit this file directly. Strike, rewrite or add lines freely; the ids are only there so each line can be tracked into the content files afterwards.

## Ground rules I wrote to

- **Pronoun: "it".** The Rabbit folio says "she", but a familiar could be anyone's.
- **Every nature with a trigger says something the numbers support,** and nothing more.
- **Nothing about size.** No line says or implies the account is small.
- **Verdicts are short,** because the diagnosis card has to read at thumbnail size.
- **General lines must fit both kinds of moth:** those that quote much larger accounts, and those that post almost only replies.

## Name

- **Title:** Of the Moth (with a variant: Of the Ghost Moth, Of the Vampire Moth, Of the Monstrous Moth)
- **Genus:** *Phalaena*. It is Linnaeus's old catch-all genus for moths, long since retired, which suits a bestiary better than a living genus would.
- **Binomials:** *Phalaena spectralis* (ghost), *Phalaena sanguisuga* (vampire), *Phalaena consuta* (monstrous). The epithets are settled and shared by every species.

## Verdicts

One of these appears on the diagnosis card. A moth with a variant can draw either a general verdict or the one written for its variant.

**General**

- `moth.verdict.1` Where another hath lit a lamp, there shall this Moth be found before the hour is out.
- `moth.verdict.2` It hath a candle of its own, and yet is ever found at its neighbour's.
- `moth.verdict.3` Shew it a flame and it will not be reasoned with.

**Ghost Moth** (seen but not heard, or given to long silences)

- `moth.verdict.ghost` It circleth the lamp nightly yet casteth no shadow upon the wall.

**Vampire Moth** (feeds on replies and mentions)

- `moth.verdict.vampire` It cometh to the flame not for the light, but for the company gathered there.

**Monstrous Moth** (stitched from links, reposts and quotes)

- `moth.verdict.monstrous` Its wings are sewn of borrowed pages, and it flieth on them well enough.

## Natures

Three appear on the scorecard. The first is always one of the moth's own whose trigger the account meets, where there is one.

**With a trigger**

| Id | Shown when | Line |
| --- | --- | --- |
| `moth.nature.quotes-up` | Quotes much larger accounts more than its peers do (top quarter) | Luminous silver gleameth in reflection from its wings. |
| `moth.nature.quotes-up-most` | The same, top tenth | It hath been seen circling the very greatest lights in the land. |
| `moth.nature.replies` | Replies make up a large share of its posts (top quarter) | It is seldom found at home, forever flitting abroad. |
| `moth.nature.replies-most` | The same, top tenth | It hath answered more than it was ever asked. |
| `moth.nature.quotes` | Quote posts make up a large share of its posts (top quarter) | It is fond of bearing another's words upon its wings, then discharging them with a flutter. |

**Fallbacks, with no trigger** (true of any moth; used to fill out the three)

- `moth.nature.general.1` It is most easily summoned. Simply ensure thy lamp is well-supplied with oil.
- `moth.nature.general.2` It is not burned by the flame, whatever the scribes report, but only warmed, and returneth nightly.
- `moth.nature.general.3` The ancients held that it eateth wool. This is a slander, put about by the Spider.

## Shared natures, first pass

Any species can draw these. Each comes in a "high" and a "low" form and appears only for accounts in the top or bottom fifth on that trait.

| Trait | High | Low |
| --- | --- | --- |
| Posting pace | It is abroad daily and often, and the scribes have given up counting. | It sheweth itself seldom, such that each appearance is noted keenly. |
| Long posts | It will not say in a line what may be said in a page. | It speaketh briefly, as one who payeth for parchment by the inch. |
| Links | It cometh always bearing something from elsewhere, and layeth it at the reader's door. | It carrieth nothing in from abroad; what it sayeth, it sayeth of itself. |
| Threads | Having spoken, it speaketh again beneath, and again beneath that, until the thing is a ladder. | It sayeth a thing once, and leaveth this to stand or fall. |
| Questions | It asketh more than it telleth, and leaveth the answering to others. | It asketh little, preferring to tell. |
| Engagement per view | Of those who behold it, an uncommon number stop to pay their respects. | It is much beheld and little remarked upon, after the manner of cathedrals. |
| Long silences | It is given to long absences, from which it returneth without explanation. | It is never long from its post. |
| Quoting others | It is fond of holding up another's words and saying its piece beneath them. | It quoteth no one, and standeth upon its own text. |
| Likes given | It is free with its approval, and leaveth a mark of favour wherever it passeth. | It giveth its approval rarely, and so it is prized. |

## Questions for you

1. **The Spider joke** in the third fallback: do you want species to needle each other? It is a good running gag if so, but it only lands for people who know the roster.
2. **"Greater light" and "greatest lights in the land"** are the closest any line comes to talking about size. They describe who the moth quotes, never the moth. Keep, or soften?
3. **A gloss under the binomial.** The Rabbit folio has one: "*Lepus hyperstitionis* — the beast that becometh real by being spoken of." A line like "the beast that is drawn to lamps it did not light" would suit the diagnosis card, but it adds a line per species and the spec doesn't list it.
4. **Three fallbacks and five triggered natures** make eight for the moth, against the spec's six to eight per species. Is that the right amount to write for the other seven?
