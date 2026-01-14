/**
 * Google Apps Script for Your Check Payment Form - UPDATED FOR YOUR WORKING FORM
 * Form ID: 1FAIpQLSdkaIGD87RUORM210G8kCWeIx60Fdc88KKkxcnmuee1bOL2Pg
 * 
 * Setup Instructions:
 * 1. Save this script
 * 2. Run setupTrigger() once
 * 3. Grant permissions when asked
 */

// Your webhook URL
const WEBHOOK_URL = 'https://shreemata.com/api/payments/webhook/cheque-payment-submitted';

/**
 * This function runs when the form is submitted
 */
/**
 * This function runs when the form is submitted (FIXED VERSION)
 */
function onFormSubmit(e) {
  try {
    console.log('📝 Form submitted, processing...');
    
    // Handle different event object structures
    const responses = e.namedValues || e.values || {};
    const formResponse = e.response || e;
    
    // Log all responses for debugging
    console.log('All form responses:', responses);
    console.log('Event object keys:', Object.keys(e));
    console.log('Event object type:', typeof e);
    
    // Extract data based on your form's field structure
    let orderId = '';
    let amount = '';
    let userEmail = '';
    let userName = '';
    let userPhone = '';
    let bankName = '';
    let checkDate = '';
    
    // Map your form fields (based on your test URL)
    for (const [key, value] of Object.entries(responses)) {
      console.log(`Field: ${key} = ${Array.isArray(value) ? value[0] : value}`);
      
      const fieldValue = Array.isArray(value) ? value[0] : value;
      
      // Try to identify fields by their entry numbers from your test URL
      if (key.includes('1788264298') || key.toLowerCase().includes('order')) {
        orderId = fieldValue;
      } else if (key.includes('1894225499') || key.toLowerCase().includes('amount')) {
        amount = fieldValue;
      } else if (key.includes('774046160') || key.toLowerCase().includes('email')) {
        userEmail = fieldValue;
      } else if (key.includes('1406386079') || key.toLowerCase().includes('name')) {
        userName = fieldValue;
      } else if (key.includes('632794616') || key.toLowerCase().includes('phone')) {
        userPhone = fieldValue;
      } else if (key.includes('980862279') || key.toLowerCase().includes('bank')) {
        bankName = fieldValue;
      } else if (key.includes('790413540') || key.toLowerCase().includes('date')) {
        checkDate = fieldValue;
      }
    }
    
    console.log('Extracted data:', {
      orderId, amount, userEmail, userName, userPhone, bankName, checkDate
    });
    
    // Handle file uploads
    const driveFileIds = [];
    let checkImageUrl = '';
    let checkImageDriveId = '';
    
    // Look for file upload responses
    for (const [key, value] of Object.entries(responses)) {
      const fieldValue = Array.isArray(value) ? value[0] : value;
      if (fieldValue && fieldValue.includes && fieldValue.includes('drive.google.com')) {
        const fileUrl = fieldValue;
        console.log('Found file URL:', fileUrl);
        
        // Extract file ID from Google Drive URL
        const fileIdMatch = fileUrl.match(/[-\w]{25,}/);
        if (fileIdMatch) {
          const fileId = fileIdMatch[0];
          driveFileIds.push(fileId);
          
          if (!checkImageUrl) {
            checkImageUrl = `https://drive.google.com/uc?id=${fileId}`;
            checkImageDriveId = fileId;
          }
          
          // Make file publicly viewable
          try {
            const file = DriveApp.getFileById(fileId);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            console.log(`✅ Made file ${fileId} publicly viewable`);
          } catch (shareError) {
            console.error('❌ Error sharing file:', shareError);
          }
        }
      }
    }
    
    // Prepare webhook data
    const webhookData = {
      orderId: orderId,
      checkNumber: 'AUTO_' + Date.now(),
      bankName: bankName,
      checkDate: checkDate,
      utrNumber: '',
      formResponseId: formResponse.getId ? formResponse.getId() : 'unknown',
      driveFileIds: driveFileIds,
      checkImageUrl: checkImageUrl,
      checkImageDriveId: checkImageDriveId,
      timestamp: new Date().toISOString(),
      userEmail: userEmail,
      userName: userName,
      amount: amount,
      allResponses: responses
    };
    
    console.log('📤 Sending webhook data:', webhookData);
    
    // Send to webhook
    const response = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify(webhookData)
    });
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    console.log('📥 Webhook response:', responseCode, responseText);
    
    if (responseCode === 200) {
      console.log('✅ Successfully sent data to webhook');
    } else {
      console.error('❌ Webhook failed:', responseCode, responseText);
    }
    
  } catch (error) {
    console.error('❌ Error in onFormSubmit:', error);
    
    // Send error email to admin
    try {
      MailApp.sendEmail({
        to: 'shashistudy2125@gmail.com',
        subject: 'Check Payment Form Error',
        body: `Error processing form: ${error.toString()}\n\nTime: ${new Date()}`
      });
    } catch (emailError) {
      console.error('Failed to send error email:', emailError);
    }
  }
}


/**
 * Setup trigger - run this once
 */
function setupTrigger() {
  try {
    // Delete existing triggers
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'onFormSubmit') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    // Get the form by ID and create trigger (using your working form)
    const formId = '1FAIpQLSdkaIGD87RUORM210G8kCWeIx60Fdc88KKkxcnmuee1bOL2Pg';
    const form = FormApp.openById(formId);
    
    // Create form submit trigger
    ScriptApp.newTrigger('onFormSubmit')
      .timeBased()
      .onFormSubmit()
      .create();
      
    console.log('✅ Trigger created successfully for form:', formId);
    
  } catch (error) {
    console.error('❌ Error setting up trigger:', error);
    console.error('Make sure you have access to the form and try again');
  }
}

/**
 * Test webhook connection
 */
function testWebhook() {
  try {
    const testData = {
      orderId: 'TEST_ORDER_123',
      checkNumber: 'TEST_CHECK_456',
      bankName: 'Test Bank',
      message: 'Test from Google Apps Script'
    };
    
    const response = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify(testData)
    });
    
    console.log('Test response:', response.getResponseCode(), response.getContentText());
    
  } catch (error) {
    console.error('Test error:', error);
  }
}