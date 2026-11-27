/**
 * utils/classLevelHelper.js
 *
 * Normalizes class level strings for robust matching across sections, subscriptions, and notes.
 * Trims leading/trailing whitespace, collapses internal whitespace sequences to a single space,
 * and converts to lower case.
 *
 * Examples:
 *   "Class 10"      -> "class 10"
 *   " class  10 "   -> "class 10"
 *   "CLASS 10"      -> "class 10"
 *   null / undefined / "" -> ""
 */

function normalizeClassLevel(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

module.exports = {
  normalizeClassLevel
};
