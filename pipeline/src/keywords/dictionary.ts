// the skill vocabulary we look for in job descriptions.
//
// why a fixed list instead of an LLM: resume screening is keyword matching against
// a known vocabulary, so that's exactly what we should do here too. it's free, it's
// deterministic, it needs no api key in the workflow, and i can actually write tests
// for it. an LLM would also happily invent skills that aren't in the posting, which
// is the worst possible failure for something you're pasting onto a resume.
//
// the rule i'm going by: a wrong keyword on your resume is worse than a missing one,
// so anything ambiguous gets a narrow pattern rather than a loose match.

// bump this whenever you change the dictionary or the scoring.
//
// keywords get cached in data/state.json so a cached run doesn't lose them, but that
// also means a bad extraction sticks around forever after you fix it. the saved
// version gets compared against this one and anything stale is thrown away and
// recomputed. i found this the hard way: roles were still tagged "Spring" from the
// season bug well after the pattern was fixed.
export const DICTIONARY_VERSION = 2;

export type SkillKind = 'language' | 'framework' | 'tool' | 'concept' | 'soft';

export interface SkillEntry {
  // what we actually show you, spelled the way you'd write it on a resume
  name: string;
  kind: SkillKind;
  // other spellings that mean the same thing
  aliases?: string[];
  // for short names that are real words too (Swift, Rust). matching with the
  // capital letter only is a cheap way to tell "Swift the language" from
  // "a swift response", because job posts capitalise tech names.
  caseSensitive?: boolean;
  // full override for the genuinely ambiguous ones (C, R, Go), where word
  // boundaries alone would match things like "vitamin C" or "go to"
  pattern?: RegExp;
}

// languages. C, R and Go get hand-written patterns, see the note above.
const LANGUAGES: SkillEntry[] = [
  { name: 'Python', kind: 'language' },
  { name: 'Java', kind: 'language', caseSensitive: true },
  { name: 'JavaScript', kind: 'language', aliases: ['JS', 'ECMAScript'] },
  { name: 'TypeScript', kind: 'language', aliases: ['TS'] },
  { name: 'C++', kind: 'language', aliases: ['CPP'] },
  { name: 'C#', kind: 'language', aliases: ['CSharp'] },
  {
    name: 'C',
    kind: 'language',
    // only count plain C when it's sat next to C++ in a list, or literally says
    // "C programming". otherwise you pick up "vitamin C" and "C level".
    pattern:
      /(?<![\w+#.])C(?=\s*(?:\/|,\s*|\s+and\s+)\s*C\+\+)|(?<=C\+\+\s*(?:\/|,|and)\s*)C(?![\w+#])|(?<![\w+#.])C\s+programming\b/g,
  },
  {
    name: 'Go',
    kind: 'language',
    // Golang is unambiguous. bare "Go" only counts inside a list of other
    // languages, otherwise every "go to" and "going" would match.
    pattern:
      /\bGolang\b|(?<![\w.])Go(?=\s*(?:,|\/|\|)\s*(?:Python|Java|Rust|C\+\+|Ruby|Scala|Kotlin|Node))|(?<=(?:Python|Java|Rust|C\+\+|JavaScript|TypeScript|Ruby|Scala)\s*(?:,|\/|\|)\s*)Go(?![\w.])/g,
  },
  {
    name: 'R',
    kind: 'language',
    // same idea, R only counts beside other data languages or as "R programming"
    pattern:
      /(?<![\w.])R(?=\s*(?:,|\/|\|)\s*(?:Python|MATLAB|SAS|SQL|Stata|Julia))|(?<=(?:Python|MATLAB|SAS|SQL|Stata|Julia)\s*(?:,|\/|\|)\s*)R(?![\w.])|(?<![\w.])R\s+(?:programming|language|studio)\b/gi,
  },
  { name: 'Rust', kind: 'language', caseSensitive: true },
  { name: 'Ruby', kind: 'language', caseSensitive: true },
  { name: 'PHP', kind: 'language' },
  { name: 'Swift', kind: 'language', caseSensitive: true },
  { name: 'Kotlin', kind: 'language' },
  { name: 'Scala', kind: 'language' },
  { name: 'Objective-C', kind: 'language', aliases: ['ObjC'] },
  { name: 'MATLAB', kind: 'language' },
  { name: 'Perl', kind: 'language' },
  { name: 'Dart', kind: 'language', caseSensitive: true },
  { name: 'Elixir', kind: 'language' },
  { name: 'Haskell', kind: 'language' },
  { name: 'Julia', kind: 'language', caseSensitive: true },
  { name: 'Lua', kind: 'language' },
  { name: 'SQL', kind: 'language' },
  { name: 'Bash', kind: 'language', aliases: ['Shell scripting', 'Zsh'] },
  { name: 'HTML', kind: 'language', aliases: ['HTML5'] },
  { name: 'CSS', kind: 'language', aliases: ['CSS3'] },
  { name: 'Assembly', kind: 'language' },
  { name: 'Verilog', kind: 'language', aliases: ['SystemVerilog'] },
  { name: 'VHDL', kind: 'language' },
  { name: 'Solidity', kind: 'language' },
];

const FRAMEWORKS: SkillEntry[] = [
  { name: 'React', kind: 'framework', aliases: ['React.js', 'ReactJS'], caseSensitive: true },
  { name: 'React Native', kind: 'framework' },
  { name: 'Next.js', kind: 'framework', aliases: ['NextJS'] },
  { name: 'Vue', kind: 'framework', aliases: ['Vue.js', 'VueJS'], caseSensitive: true },
  { name: 'Angular', kind: 'framework' },
  { name: 'Svelte', kind: 'framework' },
  { name: 'Redux', kind: 'framework' },
  { name: 'jQuery', kind: 'framework' },
  { name: 'Tailwind CSS', kind: 'framework', aliases: ['TailwindCSS', 'Tailwind'] },
  { name: 'Sass', kind: 'framework', aliases: ['SCSS'] },
  { name: 'Bootstrap', kind: 'framework' },
  { name: 'Three.js', kind: 'framework', aliases: ['ThreeJS'] },
  { name: 'D3.js', kind: 'framework', aliases: ['D3'] },
  { name: 'Node.js', kind: 'framework', aliases: ['NodeJS', 'Node JS'] },
  {
    name: 'Express',
    kind: 'framework',
    // "Express" on its own shows up in legal boilerplate ("express written consent")
    // and company names, so it needs either the .js suffix or a Node next to it
    pattern:
      /\bExpress\.?js\b|\b(?:Node\.js|Node|MERN)\s*(?:,|\/|\||\s+and\s+)\s*Express\b|\bExpress\s*(?:,|\/|\|)\s*(?:Node|MongoDB|React)\b/gi,
  },
  { name: 'Django', kind: 'framework' },
  { name: 'Flask', kind: 'framework' },
  { name: 'FastAPI', kind: 'framework' },
  { name: 'Spring Boot', kind: 'framework' },
  {
    name: 'Spring',
    kind: 'framework',
    // this one was genuinely wrong before. every internship posting says "Spring 2027"
    // somewhere, so matching a capitalised "Spring" tagged 56 roles with the Java
    // framework that had no Java in them at all. it now needs real Spring context.
    pattern:
      /\bSpring\s+(?:Boot|Framework|MVC|Cloud|Data|Security|Batch|WebFlux|AOP|JPA)\b|\bSpring\b(?=\s*(?:,|\/|\|)\s*(?:Hibernate|Java|Maven|Gradle|JPA|Kafka))|(?<=(?:Java|Hibernate|Maven|Gradle|J2EE)\s*(?:,|\/|\||\s+and\s+)\s*)Spring\b/gi,
  },
  { name: '.NET', kind: 'framework', aliases: ['ASP.NET', 'dotnet'] },
  { name: 'Ruby on Rails', kind: 'framework', aliases: ['Rails', 'RoR'] },
  { name: 'Laravel', kind: 'framework' },
  { name: 'GraphQL', kind: 'framework' },
  { name: 'gRPC', kind: 'framework' },
  { name: 'REST APIs', kind: 'framework', aliases: ['REST', 'RESTful', 'REST API'] },
  { name: 'Flutter', kind: 'framework' },
  { name: 'Unity', kind: 'framework', caseSensitive: true },
  { name: 'Unreal Engine', kind: 'framework', aliases: ['Unreal'] },
];

const DATA_ML: SkillEntry[] = [
  { name: 'Machine Learning', kind: 'concept', aliases: ['ML'] },
  { name: 'Deep Learning', kind: 'concept' },
  { name: 'Natural Language Processing', kind: 'concept', aliases: ['NLP'] },
  // deliberately not aliasing "CV" here, that means curriculum vitae far more often
  { name: 'Computer Vision', kind: 'concept' },
  { name: 'Reinforcement Learning', kind: 'concept', aliases: ['RL'] },
  { name: 'Large Language Models', kind: 'concept', aliases: ['LLM', 'LLMs'] },
  { name: 'Generative AI', kind: 'concept', aliases: ['GenAI'] },
  { name: 'TensorFlow', kind: 'tool' },
  { name: 'PyTorch', kind: 'tool' },
  { name: 'scikit-learn', kind: 'tool', aliases: ['sklearn', 'scikit learn'] },
  { name: 'Pandas', kind: 'tool' },
  { name: 'NumPy', kind: 'tool' },
  { name: 'Keras', kind: 'tool' },
  { name: 'Hugging Face', kind: 'tool', aliases: ['HuggingFace'] },
  { name: 'OpenCV', kind: 'tool' },
  { name: 'LangChain', kind: 'tool' },
  { name: 'Apache Spark', kind: 'tool', aliases: ['Spark', 'PySpark'] },
  { name: 'Hadoop', kind: 'tool' },
  { name: 'Kafka', kind: 'tool' },
  { name: 'Airflow', kind: 'tool' },
  { name: 'dbt', kind: 'tool' },
  { name: 'Snowflake', kind: 'tool' },
  { name: 'Databricks', kind: 'tool' },
  { name: 'Tableau', kind: 'tool' },
  { name: 'Power BI', kind: 'tool', aliases: ['PowerBI'] },
  { name: 'Jupyter', kind: 'tool', aliases: ['Jupyter Notebook'] },
  { name: 'Data Structures', kind: 'concept' },
  { name: 'Algorithms', kind: 'concept' },
  { name: 'Statistics', kind: 'concept', aliases: ['statistical analysis'] },
  { name: 'Linear Algebra', kind: 'concept' },
  { name: 'Data Analysis', kind: 'concept' },
  { name: 'Data Pipelines', kind: 'concept', aliases: ['ETL', 'data pipeline'] },
  { name: 'Data Modeling', kind: 'concept', aliases: ['data modelling'] },
];

const CLOUD_DEVOPS: SkillEntry[] = [
  { name: 'AWS', kind: 'tool', aliases: ['Amazon Web Services'] },
  { name: 'Azure', kind: 'tool' },
  { name: 'Google Cloud', kind: 'tool', aliases: ['GCP', 'Google Cloud Platform'] },
  { name: 'Docker', kind: 'tool' },
  { name: 'Kubernetes', kind: 'tool', aliases: ['K8s'] },
  { name: 'Terraform', kind: 'tool' },
  { name: 'Jenkins', kind: 'tool' },
  {
    name: 'CI/CD',
    kind: 'concept',
    aliases: ['continuous integration', 'continuous delivery', 'continuous deployment'],
  },
  { name: 'GitHub Actions', kind: 'tool' },
  { name: 'Ansible', kind: 'tool' },
  { name: 'Linux', kind: 'tool' },
  { name: 'Unix', kind: 'tool' },
  { name: 'Nginx', kind: 'tool' },
  { name: 'Serverless', kind: 'concept' },
  { name: 'Microservices', kind: 'concept' },
  { name: 'Distributed Systems', kind: 'concept' },
];

const DATABASES: SkillEntry[] = [
  { name: 'PostgreSQL', kind: 'tool', aliases: ['Postgres'] },
  { name: 'MySQL', kind: 'tool' },
  { name: 'MongoDB', kind: 'tool' },
  { name: 'Redis', kind: 'tool' },
  { name: 'DynamoDB', kind: 'tool' },
  { name: 'Elasticsearch', kind: 'tool' },
  { name: 'Cassandra', kind: 'tool' },
  { name: 'SQLite', kind: 'tool' },
  { name: 'Firebase', kind: 'tool' },
  { name: 'BigQuery', kind: 'tool' },
];

const TOOLS_PRACTICES: SkillEntry[] = [
  { name: 'Git', kind: 'tool', caseSensitive: true },
  { name: 'GitHub', kind: 'tool' },
  { name: 'GitLab', kind: 'tool' },
  { name: 'Jira', kind: 'tool' },
  { name: 'Figma', kind: 'tool' },
  { name: 'Postman', kind: 'tool' },
  { name: 'Selenium', kind: 'tool' },
  { name: 'Playwright', kind: 'tool' },
  { name: 'Cypress', kind: 'tool' },
  { name: 'Jest', kind: 'tool', caseSensitive: true },
  { name: 'pytest', kind: 'tool' },
  { name: 'JUnit', kind: 'tool' },
  { name: 'Agile', kind: 'concept' },
  { name: 'Scrum', kind: 'concept' },
  { name: 'Test-Driven Development', kind: 'concept', aliases: ['TDD'] },
  { name: 'Unit Testing', kind: 'concept', aliases: ['unit tests'] },
  { name: 'Code Review', kind: 'concept', aliases: ['code reviews'] },
  { name: 'Debugging', kind: 'concept' },
  { name: 'Object-Oriented Programming', kind: 'concept', aliases: ['OOP', 'object oriented'] },
  { name: 'Functional Programming', kind: 'concept' },
  { name: 'Design Patterns', kind: 'concept' },
  { name: 'System Design', kind: 'concept' },
  { name: 'API Design', kind: 'concept' },
  { name: 'Concurrency', kind: 'concept', aliases: ['multithreading', 'multi-threading'] },
  { name: 'Performance Optimization', kind: 'concept', aliases: ['performance tuning'] },
  {
    name: 'Security',
    kind: 'concept',
    // bare "security" is everywhere in boilerplate: social security number, security
    // clearance, national security, job security. none of those are a skill, so this
    // needs an actual technical qualifier attached.
    pattern:
      /\bcyber-?\s?security\b|\b(?:application|product|information|network|software|cloud|data|infrastructure|web|system)\s+security\b|\bsecurity\s+(?:engineer|engineering|vulnerabilit|best\s+practice|practices|protocol|review|testing|audit|tooling|operations|posture|research)/gi,
  },
  { name: 'Cryptography', kind: 'concept' },
  {
    name: 'Networking',
    kind: 'concept',
    // almost every posting says "networking opportunities" or "networking events",
    // which has nothing to do with computer networking. same fix as security.
    pattern:
      /\bTCP\/IP\b|\bcomputer\s+networking\b|\bnetworking\s+(?:protocol|stack|concept|fundamental|layer|technolog)|\bnetwork\s+(?:programming|protocol|stack|engineering|security|topolog|infrastructure)\b|\b(?:GPU|RDMA|kernel)\s+networking\b/gi,
  },
  { name: 'Operating Systems', kind: 'concept' },
  { name: 'Compilers', kind: 'concept' },
  { name: 'Embedded Systems', kind: 'concept', aliases: ['firmware'] },
  { name: 'FPGA', kind: 'concept' },
  { name: 'Robotics', kind: 'concept' },
  { name: 'Web Development', kind: 'concept' },
  { name: 'Mobile Development', kind: 'concept', aliases: ['iOS development', 'Android development'] },
  { name: 'Full-Stack Development', kind: 'concept', aliases: ['full stack', 'fullstack'] },
  { name: 'Frontend Development', kind: 'concept', aliases: ['front-end', 'front end'] },
  { name: 'Backend Development', kind: 'concept', aliases: ['back-end', 'back end'] },
];

// soft skills. these are the ones postings genuinely repeat, and they're worth
// having because a resume screen does look for them, but we cap how many show up
// so they don't crowd out the technical ones.
const SOFT: SkillEntry[] = [
  { name: 'Collaboration', kind: 'soft', aliases: ['collaborate', 'collaborative'] },
  {
    name: 'Cross-Functional Collaboration',
    kind: 'soft',
    aliases: ['cross-functional', 'cross functional'],
  },
  { name: 'Teamwork', kind: 'soft', aliases: ['team player', 'work in a team'] },
  {
    name: 'Communication',
    kind: 'soft',
    aliases: ['communication skills', 'communicate effectively'],
  },
  { name: 'Written Communication', kind: 'soft', aliases: ['written and verbal'] },
  { name: 'Problem Solving', kind: 'soft', aliases: ['problem-solving', 'solve problems'] },
  { name: 'Analytical Skills', kind: 'soft', aliases: ['analytical'] },
  { name: 'Critical Thinking', kind: 'soft' },
  { name: 'Attention to Detail', kind: 'soft', aliases: ['detail-oriented', 'detail oriented'] },
  { name: 'Ownership', kind: 'soft', aliases: ['take ownership', 'sense of ownership'] },
  { name: 'Initiative', kind: 'soft', aliases: ['self-starter', 'self starter', 'proactive'] },
  { name: 'Adaptability', kind: 'soft', aliases: ['adaptable', 'flexible'] },
  { name: 'Curiosity', kind: 'soft', aliases: ['curious', 'eager to learn', 'willingness to learn'] },
  { name: 'Time Management', kind: 'soft', aliases: ['prioritize', 'prioritise'] },
  { name: 'Leadership', kind: 'soft', aliases: ['lead projects'] },
  // no bare "mentor" alias on purpose: internship postings constantly say "you'll be
  // paired with a mentor", which is something they give you, not a skill you bring
  { name: 'Mentorship', kind: 'soft', aliases: ['mentoring others', 'mentorship'] },
  { name: 'Presentation Skills', kind: 'soft', aliases: ['present findings', 'presenting'] },
  {
    name: 'Fast-Paced Environment',
    kind: 'soft',
    aliases: ['fast paced', 'fast-paced', 'ambiguity'],
  },
  { name: 'Independent Work', kind: 'soft', aliases: ['work independently', 'autonomously'] },
  { name: 'Documentation', kind: 'soft', aliases: ['document your work', 'technical writing'] },
];

export const DICTIONARY: SkillEntry[] = [
  ...LANGUAGES,
  ...FRAMEWORKS,
  ...DATA_ML,
  ...CLOUD_DEVOPS,
  ...DATABASES,
  ...TOOLS_PRACTICES,
  ...SOFT,
];

// if we matched both of these, drop the second one. it's already implied by the
// first and listing both just wastes a slot (eg. nobody needs "React" and
// "Frontend Development" side by side).
export const IMPLIED: Array<[string, string]> = [
  ['React Native', 'React'],
  ['Next.js', 'React'],
  ['Spring Boot', 'Spring'],
  ['GitHub Actions', 'GitHub'],
  ['Tailwind CSS', 'CSS'],
  ['Cross-Functional Collaboration', 'Collaboration'],
  ['Written Communication', 'Communication'],
  ['Spring Boot', 'Java'],
];
