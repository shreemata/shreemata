/**
 * Google Apps Script for Check Payment Form
 * This script runs when a Google Form is submitted and sends data to your webhook
 * 
 * Setup Instructions:
 * 1. Open your Google Form
 * 2. Click the three dots menu → Script editor
 * 3. Replace the default code with this script
 * 4. Replace YOUR_WEBHOOK_URL with your actual webhook URL
 * 5. Set up a trigger for "On form submit"
 */

// Your webhook URL - replace with your actual domain
const WEBHOOK_URL = 'https://shreemata.com/api/payments/webhook/check-payment-submitted';

/**
 * This function runs automatically when the form is submitted
 */
function onFormSubmit(e) {
  try {
    console.log('Form submitted, processing...');
    
    // Get form responses
    const responses = e.namedValues;
    const formResponse = e.response;
    
    console.log('Form responses:', responses);
    
    // Extract form data - adjust field names to match your form
    const orderId = responses['Order ID'] ? responses['Order ID'][0] : '';
    const checkNumber = responses['Check Number'] ? responses['Check Number'][0] : '';
    const bankName = responses['Bank Name'] ? responses['Bank Name'][0] : '';
    const checkDate = responses['Check Date'] ? responses['Check Date'][0] : '';
    const utrNumber = responses['UTR Number'] ? responses['UTR Number'][0] : '';
    
    // Get uploaded files (if any)
    const driveFileIds = [];
    let checkImageUrl = '';
    let checkImageDriveId = '';
    
    // Process file uploads - adjust field name to match your form
    if (responses['Upload Check Image']) {
      const fileUrls = responses['Upload Check Image'];
      
      fileUrls.forEach(fileUrl => {
        if (fileUrl) {
          // Extract file ID from Google Drive URL
          const fileIdMatch = fileUrl.match(/[-\w]{25,}/);
          if (fileIdMatch) {
            const fileId = fileIdMatch[0];
            driveFileIds.push(fileId);
            
            // Set the first image as the main check image
            if (!checkImageUrl) {
              checkImageUrl = `https://drive.google.com/uc?id=${fileId}`;
              checkImageDriveId = fileId;
            }
            
            // Make file publicly viewable (optional)
            try {
              const file = DriveApp.getFileById(fileId);
              file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
              console.log(`Made file ${fileId} publicly viewable`);
            } catch (shareError) {
              console.error('Error sharing file:', shareError);
            }
          }
        }
      });
    }
    
    // Prepare webhook payload
    const webhookData = {
      orderId: orderId,
      checkNumber: checkNumber,
      bankName: bankName,
      checkDate: checkDate,
      utrNumber: utrNumber,
      formResponseId: formResponse.getId(),
      driveFileIds: driveFileIds,
      checkImageUrl: checkImageUrl,
      checkImageDriveId: checkImageDriveId,
      timestamp: new Date().toISOString(),
      formTitle: FormApp.getActiveForm().getTitle()
    };
    
    console.log('Sending webhook data:', webhookData);
    
    // Send data to your webhook
    const response = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify(webhookData)
    });
    
    const responseText = response.getContentText();
    const responseCode = response.getResponseCode();
    
    console.log('Webhook response code:', responseCode);
    console.log('Webhook response:', responseText);
    
    if (responseCode === 200) {
      console.log('✅ Successfully sent check payment data to webhook');
    } else {
      console.error('❌ Webhook request failed:', responseCode, responseText);
    }
    
  } catch (error) {
    console.error('❌ Error in onFormSubmit:', error);
    
    // Optional: Send error notification email to admin
    try {
      MailApp.sendEmail({
        to: 'shashistudy2125@gmail.com', // Replace with your admin email
        subject: 'Check Payment Form Error',
        body: `Error processing check payment form submission:\n\n${error.toString()}\n\nForm Response ID: ${e.response ? e.response.getId() : 'Unknown'}`
      });
    } catch (emailError) {
      console.error('Failed to send error email:', emailError);
    }
  }
}

/**
 * Test function to verify webhook connectivity
 * Run this manually to test your webhook
 */
function testWebhook() {
  const testData = {
    orderId: 'TEST_ORDER_123',
    checkNumber: 'TEST_CHECK_456',
    bankName: 'Test Bank',
    checkDate: '2024-01-15',
    utrNumber: 'TEST_UTR_789',
    formResponseId: 'TEST_RESPONSE_ID',
    driveFileIds: [],
    checkImageUrl: '',
    checkImageDriveId: '',
    timestamp: new Date().toISOString(),
    formTitle: 'Test Check Payment Form'
  };
  
  try {
    const response = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify(testData)
    });
    
    console.log('Test webhook response:', response.getContentText());
    console.log('Test webhook status:', response.getResponseCode());
    
  } catch (error) {
    console.error('Test webhook error:', error);
  }
}

/**
 * Setup function to create the form submit trigger
 * Run this once to set up automatic webhook calls
 */
function setupTrigger() {
  // Delete existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create new trigger
  const form = FormApp.getActiveForm();
  ScriptApp.newTrigger('onFormSubmit')
    .timeBased()
    .onFormSubmit()
    .create();
    
  console.log('✅ Form submit trigger created successfully');
}