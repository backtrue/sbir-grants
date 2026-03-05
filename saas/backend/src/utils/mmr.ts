// src/utils/mmr.ts

export interface MmrItem {
    id: string;
    score: number; // Initial relevance score (from Vectorize)
    text: string;
    metadata?: any;
}

/**
 * Calculate Jaccard Similarity using character bi-grams
 * It's lightweight and works well for Traditional Chinese text diversity checking.
 */
function calculateJaccardSimilarity(text1: string, text2: string): number {
    const getBigrams = (str: string) => {
        const bigrams = new Set<string>();
        for (let i = 0; i < str.length - 1; i++) {
            bigrams.add(str.slice(i, i + 2));
        }
        return bigrams;
    };

    if (text1.length < 2 || text2.length < 2) return 0;

    const set1 = getBigrams(text1);
    const set2 = getBigrams(text2);

    let intersection = 0;
    for (const bg of set1) {
        if (set2.has(bg)) intersection++;
    }

    const union = set1.size + set2.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

/**
 * Maximal Marginal Relevance (MMR)
 * Balances relevance to the query (score) and diversity among the results.
 * 
 * @param items Array of candidate items retrieved from Vector DB
 * @param topK Number of items to select
 * @param lambdaParam Lambda value (0 = max diversity, 1 = max relevance, default 0.6)
 * @returns Array of selected diverse items
 */
export function maximalMarginalRelevance(
    items: MmrItem[],
    topK: number,
    lambdaParam: number = 0.6
): MmrItem[] {
    if (items.length === 0) return [];

    // Sort items by score descending initially to ensure the best one is picked first
    const unselected = [...items].sort((a, b) => b.score - a.score);
    const selected: MmrItem[] = [];

    // 1. Always select the one with the highest relevance score
    selected.push(unselected.shift()!);

    // 2. Iteratively select the next best item balancing relevance and diversity
    while (selected.length < topK && unselected.length > 0) {
        let bestScore = -Infinity;
        let bestIndex = -1;

        for (let i = 0; i < unselected.length; i++) {
            const candidate = unselected[i];

            // Calculate max similarity with all ALREADY selected items
            let maxSimilarityWithSelected = 0;
            for (const sel of selected) {
                const sim = calculateJaccardSimilarity(candidate.text, sel.text);
                if (sim > maxSimilarityWithSelected) {
                    maxSimilarityWithSelected = sim;
                }
            }

            // MMR Equation
            // MMR_Score = λ * Relevance - (1 - λ) * Max_Similarity_To_Selected
            const mmrScore = (lambdaParam * candidate.score) - ((1 - lambdaParam) * maxSimilarityWithSelected);

            if (mmrScore > bestScore) {
                bestScore = mmrScore;
                bestIndex = i;
            }
        }

        if (bestIndex !== -1) {
            selected.push(unselected[bestIndex]);
            unselected.splice(bestIndex, 1);
        } else {
            break; // Should not happen unless unselected is empty
        }
    }

    return selected;
}
