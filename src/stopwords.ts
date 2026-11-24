// Common English function words, left out of Diet terms and never allowed at
// either end of the most-used phrase. Matching is on lowercase tokens.
export const STOPWORDS: ReadonlySet<string> = new Set(
  `a about above after again against all almost also always am an and any are aren't around as at
  back be because been before being below between both but by can can't cannot could couldn't did
  didn't do does doesn't doing don't down during each either else even ever every few for from
  further get gets getting go goes going gonna got had hadn't has hasn't have haven't having he
  he's her here here's hers herself him himself his how however i i'd i'll i'm i've if in into is
  isn't it it's its itself just let's like lot many may maybe me might more most much must my
  myself never no nor not now of off often on once one only or other our ours ourselves out over
  own quite rather really same she she's should shouldn't since so some still such than that
  that's the their theirs them themselves then there there's these they they'd they'll they're
  they've thing things this those though through to too under until up upon us very was wasn't we
  we'd we'll we're we've were weren't what what's when where which while who who's whom whose why
  will with within without won't would wouldn't yeah yes yet you you'd you'll you're you've your
  yours yourself yourselves`.split(/\s+/),
);
