import { describe, expect, it } from 'vitest';
import { DICTIONARY } from '../src/keywords/dictionary.js';
import { MAX_HARD, MAX_SOFT, extractSkills, htmlToText } from '../src/keywords/extract.js';

describe('htmlToText', () => {
  it('turns tags into spaces so adjacent list items do not merge', () => {
    // if tags just vanished this would come out as "JavaGo" and match neither
    expect(htmlToText('<li>Java</li><li>Go</li>')).toBe('Java Go');
  });

  it('drops script and style content', () => {
    const html = '<style>.a{color:red}</style><p>Python</p><script>var Java = 1;</script>';
    const text = htmlToText(html);
    expect(text).toContain('Python');
    expect(text).not.toContain('color');
    expect(text).not.toContain('var');
  });

  it('decodes the entities that actually show up in postings', () => {
    expect(htmlToText('<p>R&amp;D&nbsp;team</p>')).toBe('R&D team');
    expect(htmlToText('<p>&quot;quoted&quot;</p>')).toBe('"quoted"');
  });

  it('collapses whitespace', () => {
    expect(htmlToText('<p>a</p>\n\n   <p>b</p>')).toBe('a b');
  });
});

describe('extractSkills', () => {
  const swe = `
    <h2>About the role</h2>
    <p>We are looking for a Software Engineering Intern to join our platform team.</p>
    <h3>What you'll need</h3>
    <ul>
      <li>Strong programming skills in Python or Java</li>
      <li>Experience with React and TypeScript on the frontend</li>
      <li>Familiarity with Docker, Kubernetes and AWS</li>
      <li>Understanding of data structures and algorithms</li>
      <li>Experience writing unit tests and participating in code reviews</li>
      <li>Excellent written and verbal communication skills</li>
      <li>Ability to collaborate with cross-functional teams in a fast-paced environment</li>
    </ul>`;

  it('finds the main technical skills in a normal posting', () => {
    const { hard } = extractSkills('Software Engineer Intern', swe);
    for (const expected of ['Python', 'Java', 'React', 'TypeScript', 'Docker', 'Kubernetes', 'AWS']) {
      expect(hard, expected).toContain(expected);
    }
  });

  it('finds soft skills but keeps them to a handful', () => {
    const { soft } = extractSkills('Software Engineer Intern', swe);
    expect(soft.length).toBeGreaterThan(0);
    expect(soft.length).toBeLessThanOrEqual(MAX_SOFT);
  });

  it('keeps the list short enough to actually paste on a resume', () => {
    const { hard, soft } = extractSkills('Software Engineer Intern', swe);
    expect(hard.length).toBeLessThanOrEqual(MAX_HARD);
    expect(soft.length).toBeLessThanOrEqual(MAX_SOFT);
  });

  it('ranks a skill named in the title near the top', () => {
    const { hard } = extractSkills(
      'Machine Learning Intern',
      `<h3>Qualifications</h3><ul>
         <li>Proficiency in Python and PyTorch</li>
         <li>Experience with machine learning and NLP</li>
         <li>Familiar with pandas and NumPy</li>
       </ul>`,
    );
    expect(hard.slice(0, 3)).toContain('Machine Learning');
  });

  it('expands the abbreviations postings actually use', () => {
    const { hard } = extractSkills(
      'Intern',
      `<h3>Requirements</h3><ul>
         <li>Strong JS and TS experience</li>
         <li>Comfortable with k8s and Postgres</li>
         <li>Understanding of ML and NLP</li>
       </ul>`,
    );
    expect(hard).toContain('JavaScript');
    expect(hard).toContain('TypeScript');
    expect(hard).toContain('Kubernetes');
    expect(hard).toContain('PostgreSQL');
    expect(hard).toContain('Machine Learning');
    expect(hard).toContain('Natural Language Processing');
  });

  it('handles names with punctuation that word boundaries break on', () => {
    const { hard } = extractSkills(
      'Intern',
      `<h3>Requirements</h3><ul>
         <li>C++ and C# experience</li>
         <li>Node.js and .NET</li>
         <li>Next.js a plus</li>
       </ul>`,
    );
    expect(hard).toContain('C++');
    expect(hard).toContain('C#');
    expect(hard).toContain('Node.js');
    expect(hard).toContain('.NET');
    expect(hard).toContain('Next.js');
  });

  it('reads C out of the C/C++ phrasing embedded roles use', () => {
    const { hard } = extractSkills(
      'Embedded Software Intern',
      `<h3>Requirements</h3><ul>
         <li>Programming in C/C++ for embedded targets</li>
         <li>Experience with firmware and Linux</li>
         <li>Exposure to Verilog or VHDL</li>
       </ul>`,
    );
    expect(hard).toContain('C');
    expect(hard).toContain('C++');
    expect(hard).toContain('Embedded Systems');
  });

  it('drops a parent skill that a more specific one already implies', () => {
    const { hard } = extractSkills(
      'Frontend Intern',
      `<h3>Requirements</h3><ul><li>Next.js and React experience</li></ul>`,
    );
    expect(hard).toContain('Next.js');
    // Next.js already tells a reader you know React, so listing both wastes a slot
    expect(hard).not.toContain('React');
  });

  it('returns nothing for a description too short to mean anything', () => {
    expect(extractSkills('Intern', '')).toEqual({ hard: [], soft: [] });
    expect(extractSkills('Intern', '<p>TBD</p>')).toEqual({ hard: [], soft: [] });
  });
});

describe('extractSkills: things that must NOT match', () => {
  // this is the test that matters most. a wrong keyword on a resume is worse than a
  // missing one, so the ambiguous short names have to stay quiet on ordinary prose.
  const prose = `
    <p>Vitamin C is important to us. We have a C level executive team. Please go to
    our careers page to apply. Our swift response times are a point of pride and the
    team has a spring in its step. We are a rust belt company that loves ruby
    jewellery and dart games. Everyone should go home on time.</p>
    <h3>Requirements</h3>
    <ul><li>Strong spreadsheet skills and attention to detail</li></ul>`;

  it('does not invent languages out of everyday words', () => {
    const { hard } = extractSkills('Analyst Intern', prose);
    for (const wrong of ['C', 'Go', 'Swift', 'Rust', 'Ruby', 'Dart', 'Spring']) {
      expect(hard, `should not match ${wrong}`).not.toContain(wrong);
    }
  });

  it('still reads real soft skills out of the same text', () => {
    const { soft } = extractSkills('Analyst Intern', prose);
    expect(soft).toContain('Attention to Detail');
  });

  it('does not read CV as Computer Vision', () => {
    // "CV" means curriculum vitae far more often than computer vision, which is
    // why it is deliberately not an alias
    const { hard } = extractSkills('Intern', '<p>Please send your CV and cover letter.</p>');
    expect(hard).not.toContain('Computer Vision');
  });

  it('matches Go only in a list of languages, not in "go to"', () => {
    const notGo = extractSkills('Intern', '<p>Please go to the portal. Going forward we grow.</p>');
    expect(notGo.hard).not.toContain('Go');

    const isGo = extractSkills(
      'Intern',
      '<h3>Requirements</h3><ul><li>Experience in Go, Python or Rust</li></ul>',
    );
    expect(isGo.hard).toContain('Go');
  });

  it('matches Golang unconditionally since it is unambiguous', () => {
    const { hard } = extractSkills('Intern', '<p>We write our services in Golang.</p>');
    expect(hard).toContain('Go');
  });

  it('ignores the boilerplate senses of "security"', () => {
    // these turn up in nearly every posting's legal and benefits sections
    const boilerplate = extractSkills(
      'Intern',
      `<p>You must provide your social security number. This role requires an active
       security clearance. We support national security missions and offer excellent
       job security to our employees.</p>`,
    );
    expect(boilerplate.hard).not.toContain('Security');

    // but a real security role should still match
    const real = extractSkills(
      'Security Intern',
      `<h3>Requirements</h3><ul><li>Interest in application security reviews and
       threat modeling</li><li>Familiarity with cybersecurity fundamentals</li></ul>`,
    );
    expect(real.hard).toContain('Security');
  });

  it('ignores "networking opportunities" but keeps real networking', () => {
    const boilerplate = extractSkills(
      'Intern',
      `<p>Attend industry events, conferences and networking opportunities, plus
       networking events with our leadership team.</p>`,
    );
    expect(boilerplate.hard).not.toContain('Networking');

    const real = extractSkills(
      'Intern',
      `<h3>Requirements</h3><ul><li>Understanding of networking protocols and TCP/IP</li></ul>`,
    );
    expect(real.hard).toContain('Networking');
  });

  it('does not read the season "Spring 2027" as the Java framework', () => {
    // this was a real bug. every internship posting names a season, so a capitalised
    // "Spring" tagged 56 roles with the Spring framework that had no Java in them.
    const season = extractSkills(
      'Software Engineer Intern',
      `<p>We are hiring for Spring 2027 and Summer 2027 terms.</p>
       <h3>Requirements</h3><ul><li>Experience with Rust and TypeScript</li></ul>`,
    );
    expect(season.hard).not.toContain('Spring');
    expect(season.hard).toContain('Rust');

    // a genuine Java shop still matches
    for (const real of [
      '<h3>Requirements</h3><ul><li>Java and Spring Framework experience</li></ul>',
      '<h3>Requirements</h3><ul><li>Familiarity with Java/Spring</li></ul>',
      '<h3>Requirements</h3><ul><li>Spring Boot microservices</li></ul>',
    ]) {
      const { hard } = extractSkills('Backend Intern', real);
      expect(hard.some((s) => s.startsWith('Spring')), real).toBe(true);
    }
  });

  it('does not read "express written consent" as Express.js', () => {
    const legal = extractSkills(
      'Intern',
      `<p>No part of this posting may be reproduced without our express written
       consent. American Express is not affiliated with us.</p>`,
    );
    expect(legal.hard).not.toContain('Express');

    const real = extractSkills(
      'Intern',
      '<h3>Requirements</h3><ul><li>Node.js and Express experience</li></ul>',
    );
    expect(real.hard).toContain('Express');
  });

  it('does not credit you with mentorship just because they assign you a mentor', () => {
    const { soft } = extractSkills(
      'Intern',
      `<p>Every intern is paired with a mentor and gets regular feedback from their
       mentor throughout the program.</p>`,
    );
    expect(soft).not.toContain('Mentorship');
  });
});

describe('dictionary integrity', () => {
  it('has no duplicate canonical names', () => {
    const names = DICTIONARY.map((e) => e.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it('never reuses one spelling for two different skills', () => {
    // an alias colliding with another skill's name would make matches ambiguous
    const seen = new Map<string, string>();
    for (const entry of DICTIONARY) {
      for (const spelling of [entry.name, ...(entry.aliases ?? [])]) {
        const key = spelling.toLowerCase();
        const existing = seen.get(key);
        expect(existing ?? entry.name, `"${spelling}" is claimed twice`).toBe(entry.name);
        seen.set(key, entry.name);
      }
    }
  });

  it('only allows two-letter spellings when they are all-caps acronyms', () => {
    // two letters is where plain word matching gets dangerous, so those either need
    // a hand-written pattern or have to be an all-caps acronym, which the compiler
    // then matches case-sensitively ("ML" hits, "ml" in prose does not).
    // three-letter names like Lua, Git and SQL are distinctive enough to be fine.
    for (const entry of DICTIONARY) {
      if (entry.pattern) continue;
      for (const spelling of [entry.name, ...(entry.aliases ?? [])]) {
        if (spelling.length > 2) continue;
        expect(
          spelling === spelling.toUpperCase(),
          `"${spelling}" on ${entry.name} is two letters but not an all-caps acronym`,
        ).toBe(true);
      }
    }
  });
});
