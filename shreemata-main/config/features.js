// config/features.js
// Feature Flags Configuration for Shree Mata platform
// All flags default to false and can be toggled via environment variables.

function getFeatureFlag(envVar, defaultValue = false) {
  if (process.env[envVar] !== undefined) {
    const val = String(process.env[envVar]).trim().toLowerCase();
    return val === 'true' || val === '1' || val === 'yes' || val === 'on';
  }
  return defaultValue;
}

const FEATURES = {
  // Read Notes feature: PDF viewing, notes catalog, notes subscriptions
  get readNotes() { return getFeatureFlag('ENABLE_READ_NOTES', false); },
  // Text Book feature: Text book category, text book portal (defaults to TRUE to preserve existing production behavior)
  get textBook() { return getFeatureFlag('ENABLE_TEXT_BOOK', true); },
  // Question Papers feature: PDF question papers, solved papers
  get questionPapers() { return getFeatureFlag('ENABLE_QUESTION_PAPERS', false); },
  // Video Lectures feature: video lectures catalog and streaming
  get videos() { return getFeatureFlag('ENABLE_VIDEOS', false); },
  // Others study section feature: PDF viewing for miscellaneous/other study material
  get others() { return getFeatureFlag('ENABLE_OTHERS', false); }
};

module.exports = {
  FEATURES,
  getFeatureFlag
};
