// Writes the changelog's releases from git to apps/range/changelog.json, for a build that has no git (the container's):
//   node apps/range/changelog/write.ts
import { writeFileSync } from 'node:fs';
import { CHANGELOG_FILE, gitReleases } from './releases.ts';

const releases = gitReleases(process.cwd());
if (!releases) throw new Error('changelog: no tagged history here (a shallow checkout?)');
writeFileSync(CHANGELOG_FILE, JSON.stringify(releases));
console.log(`changelog: ${releases.length} releases, newest ${releases[0]!.version}`);
