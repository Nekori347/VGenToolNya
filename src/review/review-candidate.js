// ReviewCandidate is the normalized, submit-ready structure produced by the
// Review Assistant. English is the final text; Chinese is a reference copy.
//
// Shape: { english, chinese, keywords, length, starDegree, generatedAt, hash }

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100001b3n;

export function normalizeEnglishForHash(english) {
    return String(english ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Deterministic 64-bit FNV-1a over the normalized English text. This is only
// used for duplicate detection, never as a security signature.
export function reviewEnglishHash(english) {
    const normalized = normalizeEnglishForHash(english);
    let hash = FNV_OFFSET_BASIS;
    for (let index = 0; index < normalized.length; index += 1) {
        hash ^= BigInt(normalized.charCodeAt(index));
        hash = BigInt.asUintN(64, hash * FNV_PRIME);
    }
    return hash.toString(16).padStart(16, '0');
}

export function normalizeReviewCandidate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const english = typeof value.english === 'string' ? value.english.trim() : '';
    if (!english) return null;
    const candidate = {
        english,
        chinese: typeof value.chinese === 'string' ? value.chinese.trim() : '',
        keywords: Array.isArray(value.keywords)
            ? value.keywords.map((keyword) => String(keyword)).filter(Boolean)
            : (typeof value.keywords === 'string' && value.keywords.trim() ? [value.keywords.trim()] : []),
    };
    if (value.length) candidate.length = value.length;
    if (Number.isFinite(value.starDegree)) candidate.starDegree = value.starDegree;
    if (value.generatedAt) candidate.generatedAt = value.generatedAt;
    if (value.duplicate) candidate.duplicate = true;
    candidate.hash = reviewEnglishHash(english);
    return candidate;
}
