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
  readNotes: getFeatureFlag('ENABLE_READ_NOTES', false),
  // Text Book feature: Text book category, text book portal
  textBook: getFeatureFlag('ENABLE_TEXT_BOOK', false),
  // Question Papers feature: PDF question papers, solved papers
  questionPapers: getFeatureFlag('ENABLE_QUESTION_PAPERS', false),
  // Video Lectures feature: video lectures catalog and streaming
  videos: getFeatureFlag('ENABLE_VIDEOS', false)
};

module.exports = {
  FEATURES,
  getFeatureFlag
};
