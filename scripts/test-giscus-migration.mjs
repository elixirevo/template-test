import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const syncScript = path.join(scriptDir, 'sync-giscus-discussions.mjs');
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'gitblog-giscus-'));
const sourceDir = path.join(fixtureRoot, 'content/posts');
const createTerm = (value) =>
	`giscus-post-${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
const fixtures = [
	{
		discussionId: 'D_hash_fixture',
		slug: 'hashed-legacy',
		postId: '2f4ad174-baba-4aa4-89ad-72760aeb2509'
	},
	{
		discussionId: 'D_post_fixture',
		slug: 'legacy term with spaces',
		postId: '744a9970-64f5-4c37-a29d-55d90adf4619'
	}
].map((fixture, index) => ({
	...fixture,
	currentTerm: createTerm(fixture.postId),
	legacyTerm: index === 0 ? createTerm(fixture.slug) : `post:${fixture.slug}`
}));
const migratedVariables = [];
let createCalled = false;

const assert = (condition, message) => {
	if (!condition) {
		throw new Error(message);
	}
};

const readBody = async (request) => {
	const chunks = [];
	for await (const chunk of request) {
		chunks.push(chunk);
	}

	return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const server = createServer(async (request, response) => {
	const payload = await readBody(request);
	let data;

	if (payload.query.includes('ExistingGiscusDiscussions')) {
		data = {
			repository: {
				discussions: {
					nodes: fixtures.map((fixture) => ({
						id: fixture.discussionId,
						title: fixture.legacyTerm.startsWith('post:')
							? fixture.legacyTerm
							: `Fixture [${fixture.legacyTerm}]`,
						body: `Fixture body\n\ngiscus term: ${fixture.legacyTerm}`,
						bodyText: `Fixture body\n\ngiscus term: ${fixture.legacyTerm}`
					})),
					pageInfo: { hasNextPage: false, endCursor: null }
				}
			}
		};
	} else if (payload.query.includes('MigrateGiscusDiscussionTerm')) {
		migratedVariables.push(payload.variables);
		data = { updateDiscussion: { discussion: { id: payload.variables.discussionId } } };
	} else if (payload.query.includes('CreateGiscusDiscussion')) {
		createCalled = true;
		data = { createDiscussion: { discussion: { id: 'D_duplicate' } } };
	} else {
		response.writeHead(400, { 'Content-Type': 'application/json' });
		response.end(JSON.stringify({ errors: [{ message: 'Unexpected fixture query' }] }));
		return;
	}

	response.writeHead(200, { 'Content-Type': 'application/json' });
	response.end(JSON.stringify({ data }));
});

try {
	await mkdir(sourceDir, { recursive: true });
	await Promise.all(
		fixtures.map((fixture) =>
			writeFile(
				path.join(sourceDir, `${fixture.slug}.md`),
				`---\nid: ${fixture.postId}\ntitle: Fixture\ndescription: Fixture\npublished: true\n---\nBody\n`
			)
		)
	);

	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	assert(address && typeof address === 'object', 'fixture server did not start');

	const result = await new Promise((resolve) => {
		const child = spawn(process.execPath, [syncScript], {
			env: {
				...process.env,
				GISCUS_SYNC_ROOT: fixtureRoot,
				GITHUB_GRAPHQL_URL: `http://127.0.0.1:${address.port}/graphql`,
				GITHUB_REPOSITORY: 'owner/repository',
				GITHUB_TOKEN: 'fixture-token',
				PUBLIC_GISCUS_REPO: 'owner/repository',
				PUBLIC_GISCUS_REPO_ID: 'R_fixture',
				PUBLIC_GISCUS_CATEGORY_ID: 'C_fixture',
				PUBLIC_SITE_URL: 'https://example.com',
				PUBLIC_SOURCE_LOCALE: 'ko',
				PUBLIC_TRANSLATION_LOCALES: ''
			},
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => (stdout += chunk));
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.on('close', (status) => resolve({ status, stdout, stderr }));
	});

	assert(result.status === 0, result.stderr || result.stdout);
	assert(!createCalled, 'migration created a duplicate discussion');
	assert(migratedVariables.length === fixtures.length, 'not every legacy discussion was migrated');

	for (const fixture of fixtures) {
		const migrated = migratedVariables.find(
			(variables) => variables.discussionId === fixture.discussionId
		);
		assert(migrated, `migration did not update ${fixture.discussionId}`);
		assert(migrated.title.includes(fixture.currentTerm), 'migration title is missing the ID term');
		assert(!migrated.title.includes(fixture.legacyTerm), 'migration title retained the slug term');
		assert(migrated.body.includes(fixture.currentTerm), 'migration body is missing the ID term');
		assert(!migrated.body.includes(fixture.legacyTerm), 'migration body retained the slug term');
	}

	console.log('Giscus legacy-term migration fixture passed without creating a duplicate.');
} finally {
	server.close();
	await rm(fixtureRoot, { recursive: true, force: true });
}
