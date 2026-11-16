import { round, score } from './score.js';

/**
 * Path to directory containing `_list.json` and all levels
 */
const dir = '/data';

export async function fetchList() {
    const listResult = await fetch(`${dir}/_list.json`);
    try {
        const list = await listResult.json();
        return await Promise.all(
            list.map(async (path, rank) => {
                const levelResult = await fetch(`${dir}/${path}`);
                try {
                    const level = await levelResult.json();

                    // Don't list the verifier's record as a player record
                    const verifier = String(level.verifier || '').toLowerCase();
                    const records = (level.records || [])
                        .filter(
                            (record) =>
                                String(record.user || '').toLowerCase() !==
                                verifier,
                        )
                        .sort((a, b) => b.percent - a.percent);

                    return [
                        {
                            ...level,
                            path,
                            records,
                        },
                        null,
                    ];
                } catch {
                    console.error(`Failed to load level #${rank + 1} ${path}.`);
                    return [null, path];
                }
            }),
        );
    } catch {
        console.error(`Failed to load list.`);
        return null;
    }
}

export async function fetchEditors() {
    try {
        const editorsResults = await fetch(`${dir}/_editors.json`);
        const editors = await editorsResults.json();
        return editors;
    } catch {
        return null;
    }
}

// Index of the level's first victor, i.e. the first 100% record
export function firstVictorIndexOf(level) {
    return (level?.records || []).findIndex(
        (record) => record.percent === 100,
    );
}

export function firstVictorOf(level) {
    const index = firstVictorIndexOf(level);
    return index >= 0 ? level.records[index] : null;
}

export async function fetchLeaderboard() {
    const list = await fetchList();

    const scoreMap = {};
    const errs = [];
    list.forEach(([level, err], rank) => {
        if (err) {
            errs.push(err);
            return;
        }

        // Verifier credit
        const verifier = Object.keys(scoreMap).find(
            (u) => u.toLowerCase() === level.verifier.toLowerCase(),
        ) || level.verifier;
        scoreMap[verifier] ??= {
            verified: [],
            completed: [],
            progressed: [],
            creations: [],
            firstVictors: [],
        };
        const { verified } = scoreMap[verifier];
        verified.push({
            rank: rank + 1,
            level: level.name,
            path: level.path,
            score: score(rank + 1, 100, level.percentToQualify),
            link: level.verification,
        });

        // First victor
        const firstVictor = firstVictorOf(level);
        if (firstVictor) {
            const user = Object.keys(scoreMap).find(
                (u) => u.toLowerCase() === firstVictor.user.toLowerCase(),
            ) || firstVictor.user;
            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
                creations: [],
                firstVictors: [],
            };
            scoreMap[user].firstVictors ??= [];
            scoreMap[user].firstVictors.push({
                rank: rank + 1,
                level: level.name,
                path: level.path,
                link: firstVictor.link,
                date: firstVictor.date,
            });
        }

        // Records
        let verifierCompleted = false;
        level.records.forEach((record) => {
            const user = Object.keys(scoreMap).find(
                (u) => u.toLowerCase() === record.user.toLowerCase(),
            ) || record.user;
            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
                creations: [],
                firstVictors: [],
            };
            scoreMap[user].firstVictors ??= [];
            const { completed, progressed } = scoreMap[user];
            if (record.percent === 100) {
                if (user === verifier) {
                    verifierCompleted = true;
                }
                completed.push({
                    rank: rank + 1,
                    level: level.name,
                    path: level.path,
                    score: score(rank + 1, 100, level.percentToQualify),
                    link: record.link,
                    hz: record.hz,
                    mobile: record.mobile,
                    date: record.date,
                });
                return;
            }

            progressed.push({
                rank: rank + 1,
                level: level.name,
                path: level.path,
                percent: record.percent,
                score: score(rank + 1, record.percent, level.percentToQualify),
                link: record.link,
                hz: record.hz,
                mobile: record.mobile,
                date: record.date,
            });
        });

        // Verifying also counts as a completion
        if (!verifierCompleted) {
            scoreMap[verifier].completed.push({
                rank: rank + 1,
                level: level.name,
                path: level.path,
                score: score(rank + 1, 100, level.percentToQualify),
                link: level.verification,
                verified: true,
            });
        }
    });

    // Creators
    list.forEach(([level, err], rank) => {
        if (err) {
            return;
        }

        const rawCreators = Array.isArray(level.creators)
            ? level.creators
            : level.creators
              ? [level.creators]
              : [];
        const creators = [
            ...new Set([...rawCreators, level.author].filter(Boolean)),
        ];

        creators.forEach((creator) => {
            const user =
                Object.keys(scoreMap).find(
                    (u) => u.toLowerCase() === creator.toLowerCase(),
                ) || creator;
            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
            };
            scoreMap[user].creations ??= [];
            scoreMap[user].firstVictors ??= [];
            if (
                !scoreMap[user].creations.some((c) => c.level === level.name)
            ) {
                scoreMap[user].creations.push({
                    rank: rank + 1,
                    level: level.name,
                    path: level.path,
                });
            }
        });
    });

    // Wrap in extra Object containing the user and total score
    const res = Object.entries(scoreMap).map(([user, scores]) => {
        const { completed, progressed } = scores;

        // Verified levels are stored in `completed`
        const total = [completed, progressed]
            .flat()
            .reduce((prev, cur) => prev + cur.score, 0);

        return {
            user,
            total: round(total),
            ...scores,
        };
    });

    // Sort by total score
    return [res.sort((a, b) => b.total - a.total), errs];
}
