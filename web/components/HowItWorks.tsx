// the "why trust this list" bit. it's for people, but it's also most of the actual
// words on the page, and google needs words to know what a page is about. a page
// that's just a table gives it very little to go on.
//
// every claim in here has to match what the pipeline really does. if you change
// the verification rules (config.ts, verify/) come back and check this still holds.
const POINTS = [
  {
    heading: 'Where roles come from',
    body:
      'The community-maintained SimplifyJobs internship list, narrowed to software ' +
      'engineering roles in the current recruiting cycle. Each role is sorted onto the ' +
      'Undergrad, Master’s or PhD page by the degrees the posting asks for, and a role ' +
      'open to more than one shows up on each.',
  },
  {
    heading: 'Checked against the real posting',
    body:
      'Community lists go stale: roles close and stay listed for weeks. Every role here ' +
      'is checked against the company’s own job board (Greenhouse, Lever, Ashby, Workday ' +
      'and others), and one that comes back closed twice in a row is taken off. Roles we ' +
      'couldn’t reach are kept but marked unverified, so a site being down never hides a ' +
      'live role.',
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="border-t border-border-base pt-6">
      <span className="eyebrow">About this list</span>
      <h2 id="how-heading" className="mt-2 text-3xl text-text">
        How it works
      </h2>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        {POINTS.map((p) => (
          <div key={p.heading}>
            <h3 className="text-xl text-text">{p.heading}</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
