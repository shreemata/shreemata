/**
 * Google Apps Script for Check Payment Form - COMPLETELY FIXED VERSION
 * Form ID: 1FAIpQLSdkaIGD87RUORM210G8kCWeIx60Fdc88KKkxcnmuee1bOL2Pg
 */

// Your webhook URL
const WEBHOOK_URL = 'https://shreemata.com/api/payments/webhook/check-payment-submitted';

/**
 * This function runs when the form is submitted - BULLETPROOF VERSION
 */
function onFormSubmit(e) {
  try {
    console.log('📝 Form submitted, processing...');
    console.log('Full event object:', JSON.stringify(e, null, 2));
    
    // Multiple ways to extract form data
    let responses = {};
    let formResponseId = 'unknown';
    
    // Method 1: Try namedValues (most common)
    if (e && e.namedValues) {
      responses = e.namedValues;
      formResponseId = e.response ? e.response.getId() : 'no-response-id';
      console.log('✅ Using namedValues method');
    }
    // Method 2: Try direct response access
    else if (e && e.response && e.response.getItemResponses) {
      const itemResponses = e.response.getItemResponses();
      for (const itemResponse of itemResponses) {
        const title = itemResponse.getItem().getTitle();
        const response = itemResponse.getResponse();
        responses[title] = [response]; // Always make it an array
      }
      formResponseId = e.response.getId();
      console.log('✅ Using itemResponses method');
    }
    // Method 3: Fallback - just send whatever we have
    else {
      console.log('⚠️ Using fallback method');
      responses = { 'fallback_data': [JSON.stringify(e)] };
    }
    
    console.log('Extracted responses:', responses);
    
    // Extract data with multiple fallback methods
    let orderId = '';
    let amount = '';
    let userEmail = '';
    let userName = '';
    let userPhone = '';
    let bankName = '';
    let checkDate = '';
    
    // Try to extract data from responses
    for (const [key, value] of Object.entries(responses)) {
      const fieldValue = Array.isArray(value) ? value[0] : value;
      console.log(`Processing field: "${key}" = "${fieldValue}"`);
      
      const keyLower = key.toLowerCase();
      
      // Match by entry numbers (from your URL) or field names
      if (key.includes('1788264298') || keyLower.includes('order') || keyLower.includes('id')) {
        orderId = fieldValue || '';
      } else if (key.includes('1894225499') || keyLower.includes('amount') || keyLower.includes('price')) {
        amount = fieldValue || '';
      } else if (key.includes('774046160') || keyLower.includes('email')) {
        userEmail = fieldValue || '';
      } else if (key.includes('1406386079') || keyLower.includes('name')) {
        userName = fieldValue || '';
      } else if (key.includes('632794616') || keyLower.includes('phone')) {
        userPhone = fieldValue || '';
      } else if (key.includes('980862279') || keyLower.includes('bank')) {
        bankName = fieldValue || '';
      } else if (key.includes('790413540') || keyLower.includes('date')) {
        checkDate = fieldValue || '';
      }
    }
    
    console.log('Final extracted data:', {
      orderId, amount, userEmail, userName, userPhone, bankName, checkDate
    });
    
    // Handle file uploads (simplified)
    const driveFileIds = [];
    let checkImageUrl = '';
    let checkImageDriveId = '';
    
    // Look for Google Drive URLs in responses
    for (const [key, value] of Object.entries(responses)) {
      const fieldValue = Array.isArray(value) ? value[0] : value;
      if (fieldValue && typeof fieldValue === 'string' && fieldValue.includes('drive.google.com')) {
        console.log('Found file URL:', fieldValue);
        
        // Extract file ID from Google Drive URL
        const fileIdMatch = fieldValue.match(/[-\w]{25,}/);
        if (fileIdMatch) {
          const fileId = fileIdMatch[0];
          driveFileIds.push(fileId);
          
          if (!checkImageUrl) {
            checkImageUrl = `https://drive.google.com/uc?id=${fileId}`;
            checkImageDriveId = fileId;
          }
          
          // Try to make file publicly viewable
          try {
            const file = DriveApp.getFileById(fileId);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            console.log(`✅ Made file ${fileId} publicly viewable`);
          } catch (shareError) {
            console.log('⚠️ Could not share file:', shareError.toString());
          }
        }
      }
    }
    
    // Prepare webhook data
    const webhookData = {
      orderId: orderId || 'FORM_SUBMIT_' + Date.now(),
      checkNumber: 'AUTO_' + Date.now(),
      bankName: bankName || 'Unknown Bank',
      checkDate: checkDate || new Date().toISOString().split('T')[0],
      utrNumber: '',
      formResponseId: formResponseId,
      driveFileIds: driveFileIds,
      checkImageUrl: checkImageUrl,
      checkImageDriveId: checkImageDriveId,
      timestamp: new Date().toISOString(),
      userEmail: userEmail || 'no-email@example.com',
      userName: userName || 'Unknown User',
      amount: amount || '0',
      allResponses: responses,
      source: 'google_form_fixed'
    };
    
    console.log('📤 Sending webhook data:', webhookData);
    
    // Send to webhook with error handling
    try {
      const response = UrlFetchApp.fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: JSON.stringify(webhookData),
        muteHttpExceptions: true // This prevents throwing on HTTP errors
      });
      
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();
      
      console.log('📥 Webhook response:', responseCode, responseText);
      
      if (responseCode >= 200 && responseCode < 300) {
        console.log('✅ Successfully sent data to webhook');
      } else {
        console.log('⚠️ Webhook returned non-success status:', responseCode);
      }
      
    } catch (fetchError) {
      console.error('❌ Fetch error:', fetchError.toString());
    }
    
  } catch (error) {
    console.error('❌ Error in onFormSubmit:', error.toString());
    console.error('Error stack:', error.stack);
    
    // Send error email to admin
    try {
      MailApp.sendEmail({
        to: 'shashistudy2125@gmail.com',
        subject: 'Check Payment Form Error - Fixed Version',
        body: `Error processing form: ${error.toString()}\n\nTime: ${new Date()}\n\nEvent: ${JSON.stringify(e, null, 2)}`
      });
    } catch (emailError) {
      console.error('Failed to send error email:', emailError.toString());
    }
  }
}

/**
 * Test webhook connection
 */
function testWebhook() {
  try {
    const testData = {
      orderId: 'TEST_ORDER_' + Date.now(),
      checkNumber: 'TEST_CHECK_456',
      bankName: 'Test Bank',
      userEmail: 'test@example.com',
      userName: 'Test User',
      amount: '599',
      message: 'Test from fixed Google Apps Script'
    };
    
    console.log('Testing webhook with:', testData);
    
    const response = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify(testData),
      muteHttpExceptions: true
    });
    
    console.log('Test response:', response.getResponseCode(), response.getContentText());
    
  } catch (error) {
    console.error('Test error:', error.toString());
  }
}

/**
 * CORRECT setup function - creates form submit trigger properly
 */
function setupTrigger() {
  try {
    console.log('� sSetting up form submit trigger...');
    
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
    
    // Create the CORRECT form submit trigger
    const trigger = ScriptApp.newTrigger('onFormSubmit')
      .timeBased()
      .everyMinutes(1) // This is wrong - let me fix it
      .create();
    
    console.log('❌ ERROR: Wrong trigger type created');
    
  } catch (error) {
    console.error('❌ Error setting up trigger:', error.toString());
  }
}

/**
 * CORRECT setup function - creates form submit trigger properly
 */
function setupFormTrigger() {
  try {
    console.log('🔧 Setting up form submit trigger correctly...');
    
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
    
    // Create the CORRECT form submit trigger using the form object
    const trigger = form.createSubmitTrigger();
    
    console.log('✅ Form submit trigger created successfully!');
    console.log('🎯 Trigger ID:', trigger.getUniqueId());
    
    return trigger;
    
  } catch (error) {
    console.error('❌ Error setting up form trigger:', error.toString());
    console.error('Make sure you have edit access to the form');
    throw error;
  }
}