# The Werewolf: draft copy

Draft 1, Oct 5, 2026. Claude drafted; Sonya approved. These lines are now in the content files.

**Who gets it:** the rare result, about 1 account in 20. Its posts are long and its replies are short, with a wider gap between the two than almost anyone's.

**How I handled the lore:** the change of form is between the long post and the short reply. Growls and bites are there for flavour, but no line says the replies are hostile, because we don't measure that. There is also no "by day" or "by night", since nothing on the card may depend on time of day.

## Name

- **Title:** Of the Werewolf
- **Binomial:** *Lupus versipellis*, "the skin-changing wolf". *Versipellis* is the Romans' own word for a werewolf, used by Pliny and Petronius. It has no variant, so it carries its own epithet.

## Verdicts

Five, because it has no variant verdicts.

- `werewolf.verdict.1` In its own house it discourseth at length. Abroad, it answereth in a syllable, and that a growl.
- `werewolf.verdict.2` It is two creatures. They share one name and keep different company.
- `werewolf.verdict.3` Its posts are sermons and its replies are bites.
- `werewolf.verdict.4` It changeth its skin between the page and the margin.
- `werewolf.verdict.5` Long in the telling, short in the answering. The learned call this lycanthropy.

## Natures

**With a trigger**

| Id | Shown when | Line |
| --- | --- | --- |
| `werewolf.nature.gulf` | The gap between post length and reply length (top tenth; true of every werewolf) | Between its long sayings and its short answers there lieth a gulf that few creatures keep. |
| `werewolf.nature.parchment` | Many of its posts run past the old length limit (top quarter) | It hath been known to exceed the bounds of the page, and to send for more parchment. |
| `werewolf.nature.chained` | Replies to its own posts more than most (top quarter) | One long saying doth not content it. It must chain several together. |
| `werewolf.nature.snaps` | Replies to others a great deal (top quarter) | It answereth often and briefly, as one snapping at flies. |
| `werewolf.nature.concluded` | Replies to others little (lowest quarter) | It answereth seldom. When it doth, the matter is soon concluded. |

**Fallbacks, with no trigger**

- `werewolf.nature.general.1` It is entered here as rare, for few have seen the change and fewer have written it down.
- `werewolf.nature.general.2` The moon hath nothing to do with it, whatever the villagers say.
- `werewolf.nature.general.3` It hath no quarrel with the Goat, and wisheth this were better known.

## Notes

- **The first triggered nature is true of every werewolf,** since the gap is what makes one. It works as a fourth always-available line that happens to be about the numbers.
- **"The old length limit"** is 280 characters.
