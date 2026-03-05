// src/utils/query_expansion.ts

import synonymsData from '../../../../shared_domain/query_synonyms.json';

const SYNONYM_GROUPS: string[][] = synonymsData.synonym_groups;

const WORD_TO_GROUP = new Map<string, string[]>();

for (const group of SYNONYM_GROUPS) {
    for (const word of group) {
        WORD_TO_GROUP.set(word.toLowerCase(), group.filter(w => w !== word));
    }
}

export function expandQuery(query: string): string[] {
    const expanded: string[] = [query];
    const queryLower = query.toLowerCase();
    const seenWords = new Set<string>();

    for (const [wordLower, synonyms] of WORD_TO_GROUP.entries()) {
        if (seenWords.has(wordLower)) continue;

        const isEnglish = /^[a-zA-Z0-9_\-\s]+$/.test(wordLower);

        if (isEnglish) {
            const regex = new RegExp(`\\b${wordLower}\\b`, 'i');
            if (!regex.test(queryLower)) continue;
        } else {
            if (!queryLower.includes(wordLower)) continue;
        }

        seenWords.add(wordLower);

        let originalCase: string | null = null;
        for (const group of SYNONYM_GROUPS) {
            const found = group.find(w => w.toLowerCase() === wordLower);
            if (found) {
                originalCase = found;
                break;
            }
        }

        for (const syn of synonyms) {
            let newQuery = query;
            if (isEnglish && originalCase) {
                newQuery = query.replace(new RegExp(`\\b${originalCase}\\b`, 'gi'), syn);
            } else if (originalCase && query.includes(originalCase)) {
                newQuery = query.replaceAll(originalCase, syn);
            } else {
                newQuery = queryLower.replaceAll(wordLower, syn);
            }

            if (!expanded.includes(newQuery)) {
                expanded.push(newQuery);
            }
        }
    }

    return expanded;
}
