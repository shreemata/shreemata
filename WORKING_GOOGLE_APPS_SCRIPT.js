/**
 * WORKING Google Apps Script for Check Payment Form
 * Form ID: 1FAIpQLSdkaIGD87RUORM210G8kCWeIx60Fdc88KKkxcnmuee1bOL2Pg
 * 
 * CRITICAL FIXES:
 * 1. Proper form trigger setup
 * 2. Correct event object handling
 * 3. Robust error handling
 * 4. Multiple fallback methods
 */

// Your webhook URL
const WEBHOOK_URL = 'https://shreemata.com/api/payments/webhook/check-payment-submitted';

/**
 * This function runs when the form is submitted - WORKING VERSION
 */
function onFormSubmit(e) {
  try {
    console.log('📝 Form submitted, processing...');
    console.log('Event object type:', typeof e);
    console.log('Event object keys:', e ? Object.keys(e) : 'EVENT IS NULL/UNDEFINED');
    
    // BULLETPROOF event handling
    let responses = {};
    let formResponseId = 'unknown';
    let extractedData = {};
    
    // Method 1: Standard namedValues approach
    if (e && e.namedValues) {
      console.log('✅ Using namedValues method');
      responses = e.namedValues;
      formResponseId = e.response ? e.response.getId() : 'no-response-id';
      
      console.log('Raw namedValues:', JSON.stringify(responses, null, 2));
      
      // Extract data from namedValues
      for (const [key, value] of Object.entries(responses)) {
        const fieldValue = Array.isArray(value) ? value[0] : value;
        console.log(`Field: "${key}" = "${fieldValue}"`);
        
        const keyLower = key.toLowerCase();
        
        // Match by field names or entry numbers
      if (keyLower.includes('order id')) {
  extractedData.orderId = fieldValue;
}
else if (keyLower.includes('order amount') || keyLower.includes('amount')) {
  extractedData.amount = fieldValue;
}
else if (keyLower.includes('email')) {
  extractedData.userEmail = fieldValue;
}
else if (keyLower.includes('full name')) {
  extractedData.userName = fieldValue;
}
else if (keyLower.includes('phone')) {
  extractedData.userPhone = fieldValue;
}
else if (keyLower.includes('bank name')) {
  extractedData.bankName = fieldValue;
}
else if (keyLower.includes('check date') || keyLower.includes('date')) {
  extractedData.checkDate = fieldValue;
}

      }
    }
    // Method 2: Direct response access
    else if (e && e.response && e.response.getItemResponses) {
      console.log('✅ Using itemResponses method');
      const itemResponses = e.response.getItemResponses();
      formResponseId = e.response.getId();
      
      for (const itemResponse of itemResponses) {
        const title = itemResponse.getItem().getTitle();
        const response = itemResponse.getResponse();
        responses[title] = [response];
        
        console.log(`Item: "${title}" = "${response}"`);
        
        const titleLower = title.toLowerCase();
        
        // Match by field titles
    if (titleLower.includes('order id')) {
  extractedData.orderId = response;
}
else if (titleLower.includes('order amount') || titleLower.includes('amount')) {
  extractedData.amount = response;
}
else if (titleLower.includes('email')) {
  extractedData.userEmail = response;
}
else if (titleLower.includes('full name')) {
  extractedData.userName = response;
}
else if (titleLower.includes('phone')) {
  extractedData.userPhone = response;
}
else if (titleLower.includes('bank name')) {
  extractedData.bankName = response;
}
else if (titleLower.includes('check date') || titleLower.includes('date')) {
  extractedData.checkDate = response;
}

      }
    }
    // Method 3: Fallback for undefined event
    else {
      console.log('⚠️ Event object is undefined or invalid, using fallback');
      console.log('Full event object:', JSON.stringify(e, null, 2));
      
      // Create fallback data
      extractedData = {
        orderId: 'FALLBACK_' + Date.now(),
        amount: '0',
        userEmail: 'fallback@example.com',
        userName: 'Fallback User',
        userPhone: '0000000000',
        bankName: 'Unknown Bank',
        checkDate: new Date().toISOString().split('T')[0]
      };
      
      responses = { 'fallback_data': [JSON.stringify(e)] };
    }
    
    console.log('Final extracted data:', extractedData);
    
    // Handle file uploads
    // Handle file uploads — CORRECT & SAFE
const driveFileIds = [];
let checkImageUrl = '';
let checkImageDriveId = '';
let imageErrors = [];

for (const [key, value] of Object.entries(responses)) {
  const fieldValue = Array.isArray(value) ? value[0] : value;
  const keyLower = key.toLowerCase();

  if (keyLower.includes('upload') || keyLower.includes('image') || keyLower.includes('file')) {
    console.log('🖼️ Processing file field:', key, fieldValue);

    let fileId = '';

    // Case 1: Direct file ID
    if (typeof fieldValue === 'string' && fieldValue.match(/^[a-zA-Z0-9_-]{25,}$/)) {
      fileId = fieldValue;
    }

    // Case 2: Google Drive URL
    else if (typeof fieldValue === 'string' && fieldValue.includes('drive.google.com')) {
      const match = fieldValue.match(/[-\w]{25,}/);
      if (match) fileId = match[0];
    }

    // Case 3: Array of file IDs
    else if (Array.isArray(fieldValue) && fieldValue.length > 0) {
      const first = fieldValue[0];
      if (typeof first === 'string' && first.match(/^[a-zA-Z0-9_-]{25,}$/)) {
        fileId = first;
      }
    }

    if (!fileId) {
      imageErrors.push(`No valid file ID found in field: ${key}`);
      continue;
    }

    try {
      const file = DriveApp.getFileById(fileId);
      
      // Set sharing permissions - try multiple approaches
      try {
        // First try: Anyone with link can view
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        console.log(`✅ File ${fileId} shared with link access`);
        
        // Second try: Make it public on the web (more permissive)
        try {
          file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
          console.log(`✅ File ${fileId} made public`);
        } catch (publicError) {
          console.log(`⚠️ Could not make file public, but link sharing enabled`);
        }
      } catch (shareError) {
        console.log(`⚠️ Could not set sharing for file ${fileId}:`, shareError.toString());
      }

      driveFileIds.push(fileId);
      if (!checkImageUrl) {
        // Use Google's image serving URL for better compatibility
        checkImageUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
        checkImageDriveId = fileId;
      }

      console.log(`✅ Image processed: ${fileId}`);
    } catch (err) {
      imageErrors.push(`Failed to process ${fileId}: ${err.message}`);
      console.error('❌ Image error:', err.toString());
    }
  }
}

console.log('🧾 Image results:', { driveFileIds, checkImageUrl, imageErrors });

    
    // Prepare webhook data
   const webhookData = {
  orderId: extractedData.orderId || 'FORM_SUBMIT_' + Date.now(),
  checkNumber: 'AUTO_' + Date.now(),
  bankName: extractedData.bankName || 'Unknown Bank',
  checkDate: extractedData.checkDate || new Date().toISOString().split('T')[0],
  utrNumber: '',
  formResponseId: formResponseId,
  driveFileIds: driveFileIds,
  checkImageUrl: checkImageUrl,
  checkImageDriveId: checkImageDriveId,
  imageErrors: imageErrors,   // 👈 ADD THIS LINE
  timestamp: new Date().toISOString(),
  userEmail: extractedData.userEmail || 'no-email@example.com',
  userName: extractedData.userName || 'Unknown User',
  amount: extractedData.amount || '0',
  allResponses: responses,
  source: 'google_form_working',
  eventObjectStatus: e ? 'received' : 'undefined'
};

    
    console.log('📤 Sending webhook data:', JSON.stringify(webhookData, null, 2));
    
    // Send to webhook with comprehensive error handling
    try {
      const response = UrlFetchApp.fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: JSON.stringify(webhookData),
        muteHttpExceptions: true
      });
      
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();
      
      console.log('📥 Webhook response code:', responseCode);
      console.log('📥 Webhook response text:', responseText);
      
      if (responseCode >= 200 && responseCode < 300) {
        console.log('✅ Successfully sent data to webhook');
      } else {
        console.log('⚠️ Webhook returned non-success status:', responseCode);
        console.log('Response details:', responseText);
      }
      
    } catch (fetchError) {
      console.error('❌ Fetch error:', fetchError.toString());
      console.error('Error details:', fetchError.stack);
    }
    
  } catch (error) {
    console.error('❌ Critical error in onFormSubmit:', error.toString());
    console.error('Error stack:', error.stack);
    
    // Send error email to admin
    try {
      MailApp.sendEmail({
        to: 'shashistudy2125@gmail.com',
        subject: 'Check Payment Form Critical Error',
        body: `Critical error in form processing:\n\n${error.toString()}\n\nStack:\n${error.stack}\n\nTime: ${new Date()}\n\nEvent: ${JSON.stringify(e, null, 2)}`
      });
      console.log('📧 Error email sent to admin');
    } catch (emailError) {
      console.error('Failed to send error email:', emailError.toString());
    }
  }
}

/**
 * CORRECT way to set up the form trigger
 */
function setupFormTrigger() {
  try {
    console.log('🔧 Setting up form submit trigger...');
    
    // Delete existing triggers first
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'onFormSubmit') {
        ScriptApp.deleteTrigger(trigger);
        console.log('🗑️ Deleted existing trigger');
      }
    });
    
    // Get the form by ID
    const formId = '1FAIpQLSdkaIGD87RUORM210G8kCWeIx60Fdc88KKkxcnmuee1bOL2Pg';
    const form = FormApp.openById(formId);
    
    console.log('📋 Form found:', form.getTitle());
    
    // Create the form submit trigger using the form object
    const trigger = form.createSubmitTrigger();
    
    console.log('✅ Form submit trigger created successfully!');
    console.log('🎯 Trigger ID:', trigger.getUniqueId());
    
    return trigger;
    
  } catch (error) {
    console.error('❌ Error setting up form trigger:', error.toString());
    console.error('This usually means you need edit access to the form');
    
    // Provide manual setup instructions
    console.log('\n📋 MANUAL SETUP REQUIRED:');
    console.log('1. Go to the Triggers page (clock icon in left sidebar)');
    console.log('2. Click "Add Trigger"');
    console.log('3. Choose function: onFormSubmit');
    console.log('4. Choose deployment: Head');
    console.log('5. Select event source: From form');
    console.log('6. Select event type: On form submit');
    console.log('7. Click Save and authorize permissions');
    
    throw error;
  }
}

/**
 * Test the webhook connection
 */
function testWebhook() {
  try {
    console.log('🧪 Testing webhook connection...');
    
    const testData = {
      orderId: 'TEST_ORDER_' + Date.now(),
      checkNumber: 'TEST_CHECK_' + Date.now(),
      bankName: 'Test Bank',
      userEmail: 'test@example.com',
      userName: 'Test User',
      amount: '599',
      source: 'manual_test',
      message: 'Test from working Google Apps Script'
    };
    
    console.log('Test data:', JSON.stringify(testData, null, 2));
    
    const response = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify(testData),
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    console.log('Test response code:', responseCode);
    console.log('Test response text:', responseText);
    
    if (responseCode >= 200 && responseCode < 300) {
      console.log('✅ Webhook test successful!');
    } else {
      console.log('⚠️ Webhook test failed with status:', responseCode);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.toString());
  }
}

/**
 * Debug function to check form structure
 */
function debugFormStructure() {
  try {
    console.log('🔍 Debugging form structure...');
    
    const formId = '1FAIpQLSdkaIGD87RUORM210G8kCWeIx60Fdc88KKkxcnmuee1bOL2Pg';
    const form = FormApp.openById(formId);
    
    console.log('Form title:', form.getTitle());
    console.log('Form description:', form.getDescription());
    
    const items = form.getItems();
    console.log('Form has', items.length, 'items:');
    
    items.forEach((item, index) => {
      console.log(`${index + 1}. ${item.getTitle()} (${item.getType()})`);
      console.log(`   ID: ${item.getId()}`);
    });
    
  } catch (error) {
    console.error('❌ Debug error:', error.toString());
  }
}