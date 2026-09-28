import { DICTIONARY, IMPLIED, type SkillEntry, type SkillKind } from './dictionary.js';

// how many of each we keep. the whole point is a short list you can actually paste
// onto a resume, so more is genuinely worse here.
export const MAX_HARD = 9;
export const MAX_SOFT = 3;

export interface ExtractedSkills {
  // technical stuff, best match first
  hard: string[];
  // soft skills, best match first
  soft: string[];
}

// turn a job description into plain text we can search.
//
// these come through as HTML from every job board, and a couple of things have to
// happen before matching or we get nonsense: script and style blocks have to go
// (they're full of words that aren't skills), and tags need to become spaces rather
// than just vanishing, otherwise "<li>Java</li><li>Go</li>" becomes "JavaGo".
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// headings that mean "the actual requirements start here". anything mentioned after
// one of these matters more than something mentioned in the company blurb at the top.
const REQUIREMENTS_HEADING =
  /(requirements|qualifications|what you'?ll need|what we'?re looking for|who you are|you have|your skills|skills|preferred|nice to have|basic qualifications|minimum qualifications|tech stack|technologies)/i;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// build the regex for one spelling of a skill.
//
// we can't just use \b because loads of these have punctuation in them. \b would
// break on "C++", "C#", ".NET" and "Node.js". so we hand-roll the boundaries and
// treat +, # and . as part of a name rather than a separator.
function needleRegex(needle: string, caseSensitive: boolean): RegExp {
  const body = escapeRegex(needle).replace(/\\?[ ]/g, '[\\s-]+');
  return new RegExp(`(?<![\\w+#.])${body}(?![\\w+#])`, caseSensitive ? 'g' : 'gi');
}

// two-letter acronyms (JS, TS, ML, RL) always match case-sensitively, even when the
// skill itself doesn't. "ML" in a posting means machine learning, but matching it
// case-insensitively would also pick up "ml" in ordinary prose. the full spelling
// still matches either way so we barely lose anything.
//
// deliberately only two letters: three-letter ones like SQL, AWS and CSS get written
// lowercase often enough that forcing caps would cost real matches, and they're
// distinctive enough not to need it.
function isRiskyAcronym(spelling: string): boolean {
  return spelling.length <= 2 && /[A-Z]/.test(spelling) && spelling === spelling.toUpperCase();
}

interface CompiledEntry {
  entry: SkillEntry;
  // lowercased plain strings, used as a cheap "is it even worth running the regex" check
  needles: string[];
  patterns: RegExp[];
}

// compile the whole dictionary once, not once per job. with ~1,000 jobs and ~250
// skills this is the difference between fast and unusable.
const COMPILED: CompiledEntry[] = DICTIONARY.map((entry) => {
  if (entry.pattern) {
    return { entry, needles: [], patterns: [entry.pattern] };
  }
  const spellings = [entry.name, ...(entry.aliases ?? [])];
  return {
    entry,
    needles: spellings.map((s) => s.toLowerCase()),
    patterns: spellings.map((s) => needleRegex(s, entry.caseSensitive === true || isRiskyAcronym(s))),
  };
});

function countMatches(pattern: RegExp, text: string): number {
  // the patterns are all global, so reset before reusing them across jobs
  pattern.lastIndex = 0;
  let n = 0;
  while (pattern.exec(text) !== null) {
    n++;
    if (n > 50) break; // plenty; no need to keep counting a term used constantly
    if (pattern.lastIndex === 0) break; // zero-length match guard, don't spin forever
  }
  pattern.lastIndex = 0;
  return n;
}

// hard skills are worth more than soft ones, and a named language or tool is worth
// more than a vague concept. this is what stops every role coming back as
// "Collaboration, Communication, Teamwork".
const KIND_WEIGHT: Record<SkillKind, number> = {
  language: 3.0,
  framework: 2.6,
  tool: 2.2,
  concept: 1.6,
  soft: 1.0,
};

interface Scored {
  name: string;
  kind: SkillKind;
  score: number;
}

// pull the key skills out of a job posting.
//
// scoring is roughly: what kind of skill it is, how often it comes up, whether it's
// in the job title, and whether it turns up in the requirements section rather than
// the company's intro paragraph.
export function extractSkills(title: string, description: string): ExtractedSkills {
  const text = htmlToText(description);
  // anything this short is a placeholder ("TBD", an empty div), not a description
  if (text.length < 20) return { hard: [], soft: [] };

  const haystack = text.toLowerCase();
  const titleLower = title.toLowerCase();

  // everything after the first requirements-ish heading. if there isn't one we just
  // treat the back half of the posting as the important part, since the intro blurb
  // is almost always at the top.
  const headingAt = text.search(REQUIREMENTS_HEADING);
  const requirements = (headingAt >= 0 ? text.slice(headingAt) : text.slice(text.length / 2)).toLowerCase();

  const scored: Scored[] = [];

  for (const { entry, needles, patterns } of COMPILED) {
    // cheap prefilter. a plain string search is far quicker than a regex, so only
    // run the real pattern if the text contains the word at all.
    if (needles.length > 0 && !needles.some((n) => haystack.includes(n))) continue;

    let hits = 0;
    for (const pattern of patterns) hits += countMatches(pattern, text);
    if (hits === 0) continue;

    let score = KIND_WEIGHT[entry.kind];
    // diminishing returns on repeats, so a word spammed 30 times doesn't dominate
    score *= 1 + Math.log2(1 + hits) * 0.35;

    // named in the title is the strongest signal there is
    const inTitle = [entry.name, ...(entry.aliases ?? [])].some((s) =>
      titleLower.includes(s.toLowerCase()),
    );
    if (inTitle) score *= 2.2;

    // mentioned where they list what they actually want
    if (needles.some((n) => requirements.includes(n))) score *= 1.4;

    scored.push({ name: entry.name, kind: entry.kind, score });
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const present = new Set(scored.map((s) => s.name));
  const redundant = new Set<string>();
  for (const [child, parent] of IMPLIED) {
    if (present.has(child) && present.has(parent)) redundant.add(parent);
  }

  const hard: string[] = [];
  const soft: string[] = [];
  for (const item of scored) {
    if (redundant.has(item.name)) continue;
    if (item.kind === 'soft') {
      if (soft.length < MAX_SOFT) soft.push(item.name);
    } else if (hard.length < MAX_HARD) {
      hard.push(item.name);
    }
    if (hard.length >= MAX_HARD && soft.length >= MAX_SOFT) break;
  }

  return { hard, soft };
}
