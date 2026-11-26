/**
 * Known typo domains mapped to their canonical domain corrections.
 */
const EMAIL_TYPO_DOMAINS = Object.freeze({
    // Gmail typos
    'gamil.com': 'gmail.com',
    'gmial.com': 'gmail.com',
    'gmai.com': 'gmail.com',
    'gmaill.com': 'gmail.com',
    'gnail.com': 'gmail.com',
    'gmail.con': 'gmail.com',
    'gmail.co': 'gmail.com',
    'gmail.cm': 'gmail.com',
    'gmail.om': 'gmail.com',
    'gmail.comm': 'gmail.com',
    'gmil.com': 'gmail.com',
    'gmal.com': 'gmail.com',

    // Yahoo typos
    'yahooo.com': 'yahoo.com',
    'yaho.com': 'yahoo.com',
    'yahoo.con': 'yahoo.com',

    // Hotmail typos
    'hotmial.com': 'hotmail.com',
    'hotmal.com': 'hotmail.com',
    'hotmail.con': 'hotmail.com',

    // Outlook typos
    'outlok.com': 'outlook.com',
    'outlook.con': 'outlook.com'
});

/**
 * Checks an email string for known domain typos.
 * Case-insensitive for domain, handles leading/trailing whitespace.
 *
 * @param {string} email
 * @returns {{ original: string, local: string, typoDomain: string, correctedDomain: string, suggestion: string, error: string } | null}
 */
function getEmailTypoSuggestion(email) {
    if (!email || typeof email !== 'string') return null;
    const trimmed = email.trim();
    const atIndex = trimmed.lastIndexOf('@');
    if (atIndex <= 0 || atIndex === trimmed.length - 1) return null;

    const local = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex + 1).toLowerCase();

    if (Object.prototype.hasOwnProperty.call(EMAIL_TYPO_DOMAINS, domain)) {
        const correctedDomain = EMAIL_TYPO_DOMAINS[domain];
        const suggestion = `${local}@${correctedDomain}`;
        return {
            original: trimmed,
            local,
            typoDomain: domain,
            correctedDomain,
            suggestion,
            error: `Did you mean ${suggestion}?`
        };
    }

    return null;
}

module.exports = {
    EMAIL_TYPO_DOMAINS,
    getEmailTypoSuggestion
};
