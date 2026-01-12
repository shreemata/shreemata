/**
 * Google Apps Script for Bank Transfer Payment Form
 * Form ID: 1EmDm2ZdAuHpEzQ7IMe8q4Waw_v0d61Lx_lDCMLCXdoU
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to the bank transfer Google Form
 * 2. Click Extensions > Apps Script
 * 3. Replace the default code with this script
 * 4. Save the script (Ctrl+S)
 * 5. Run setupFormTrigger() once to set up the trigger
 * 6. Grant permissions when asked
 */

// Your webhook URL (same as check payment)
const WEBHOOK_URL = 'https://shreemata.com/api/payments/webhook/check-payment-submitted';

/**
 * This function runs when the bank transfer form is submitted
 */
function onFormSubmit(e) {
  try {
    console.log('🏦 Bank transfer form submitted, processing...');
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
      
      // Extract data from namedValues (using bank transfer form entry numbers)
      for (const [key, value] of Object.entries(responses)) {
        const fieldValue = Array.isArray(value) ? value[0] : value;
        console.log(`Field: "${key}" = "${fieldValue}"`);
        
        const keyLower = key.toLowerCase();
        
        // Match by field names or entry numbers for BANK TRANSFER form
        if (key.includes('209098555') || keyLower.includes('order') || keyLower.includes('id')) {
          extractedData.orderId = fieldValue || '';
        } else if (key.includes('701631358') || keyLower.includes('amount') || keyLower.includes('price')) {
          extractedData.amount = fieldValue || '';
        } else if (key.includes('1509226876') || keyLower.includes('email')) {
          extractedData.userEmail = fieldValue || '';
        } else if (key.includes('485473134') || keyLower.includes('name')) {
          extractedData.userName = fieldValue || '';
        } else if (keyLower.includes('phone')) {
          extractedData.userPhone = fieldValue || '';
        } else if (keyLower.includes('bank')) {
          extractedData.bankName = fieldValue || '';
        } else if (keyLower.includes('utr') || keyLower.includes('reference')) {
          extractedData.utrNumber = fieldValue || '';
        } else if (keyLower.includes('date')) {
          extractedData.transferDate = fieldValue || '';
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
        
        // Match by field titles for bank transfer
        if (titleLower.includes('order') || titleLower.includes('id')) {
          extractedData.orderId = response || '';
        } else if (titleLower.includes('amount') || titleLower.includes('price')) {
          extractedData.amount = response || '';
        } else if (titleLower.includes('email')) {
          extractedData.userEmail = response || '';
        } else if (titleLower.includes('name')) {
          extractedData.userName = response || '';
        } else if (titleLower.includes('phone')) {
          extractedData.userPhone = response || '';
        } else if (titleLower.includes('bank')) {
          extractedData.bankName = response || '';
        } else if (titleLower.includes('utr') || titleLower.includes('reference')) {
          extractedData.utrNumber = response || '';
        } else if (titleLower.includes('date')) {
          extractedData.transferDate = response || '';
        }
      }
    }
    // Method 3: Fallback for undefined event
    else {
      console.log('⚠️ Event object is undefined or invalid, using fallback');
      console.log('Full event object:', JSON.stringify(e, null, 2));
      
      // Create fallback data
      extractedData = {
        orderId: 'FALLBACK_TRANSFER_' + Date.now(),
        amount: '0',
        userEmail: 'fallback@example.com',
        userName: 'Fallback User',
        userPhone: '0000000000',
        bankName: 'Unknown Bank',
        utrNumber: '',
        transferDate: new Date().toISOString().split('T')[0]
      };
      
      responses = { 'fallback_data': [JSON.stringify(e)] };
    }
    
    console.log('Final extracted data:', extractedData);
    
    // Handle file uploads (same logic as check payment)
    const driveFileIds = [];
    let checkImageUrl = '';
    let checkImageDriveId = '';
    
    // Look for file upload responses
    for (const [key, value] of Object.entries(responses)) {
      const fieldValue = Array.isArray(value) ? value[0] : value;
      console.log(`Checking field for files: "${key}" = "${fieldValue}"`);
      
      // Check if this is a file upload field
      const keyLower = key.toLowerCase();
      if (keyLower.includes('upload') || keyLower.includes('image') || keyLower.includes('file') || keyLower.includes('receipt')) {
        console.log('Found file upload field:', key);
        
        // Handle different file ID formats
        let fileId = '';
        
        if (typeof fieldValue === 'string') {
          // Case 1: Direct file ID
          if (fieldValue.match(/^[a-zA-Z0-9_-]{25,}$/)) {
            fileId = fieldValue;
            console.log('Found direct file ID:', fileId);
          }
          // Case 2: Google Drive URL
          else if (fieldValue.includes('drive.google.com')) {
            const fileIdMatch = fieldValue.match(/[-\w]{25,}/);
            if (fileIdMatch) {
              fileId = fileIdMatch[0];
              console.log('Extracted file ID from URL:', fileId);
            }
          }
        }
        // Case 3: Array containing file ID
        else if (Array.isArray(fieldValue) && fieldValue.length > 0) {
          const firstItem = fieldValue[0];
          if (typeof firstItem === 'string' && firstItem.match(/^[a-zA-Z0-9_-]{25,}$/)) {
            fileId = firstItem;
            console.log('Found file ID in array:', fileId);
          }
        }
        
        if (fileId) {
          driveFileIds.push(fileId);
          
          if (!checkImageUrl) {
            // Use Google's image serving URL for better compatibility
            checkImageUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
            checkImageDriveId = fileId;
            console.log('Set primary image URL:', checkImageUrl);
          }
          
          // Try to make file publicly viewable
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
            
            console.log(`✅ Transfer receipt processed: ${fileId}`);
          } catch (err) {
            console.error('❌ File processing error:', err.toString());
          }
        }
      }
    }
    
    console.log('🧾 File processing results:', {
      driveFileIds: driveFileIds,
      checkImageUrl: checkImageUrl,
      checkImageDriveId: checkImageDriveId
    });
    
    // Prepare webhook data (same format as check payment but with transfer-specific fields)
    const webhookData = {
      orderId: extractedData.orderId || 'TRANSFER_SUBMIT_' + Date.now(),
      checkNumber: '', // Not applicable for bank transfers
      bankName: extractedData.bankName || 'Unknown Bank',
      checkDate: extractedData.transferDate || new Date().toISOString().split('T')[0],
      utrNumber: extractedData.utrNumber || '',
      formResponseId: formResponseId,
      driveFileIds: driveFileIds,
      checkImageUrl: checkImageUrl, // Will contain transfer receipt image
      checkImageDriveId: checkImageDriveId,
      timestamp: new Date().toISOString(),
      userEmail: extractedData.userEmail || 'no-email@example.com',
      userName: extractedData.userName || 'Unknown User',
      amount: extractedData.amount || '0',
      allResponses: responses,
      source: 'google_form_bank_transfer',
      eventObjectStatus: e ? 'received' : 'undefined',
      paymentType: 'transfer' // Identify this as a bank transfer
    };
    
    console.log('📤 Sending bank transfer webhook data:', JSON.stringify(webhookData, null, 2));
    
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
        console.log('✅ Successfully sent bank transfer data to webhook');
      } else {
        console.log('⚠️ Webhook returned non-success status:', responseCode);
        console.log('Response details:', responseText);
      }
      
    } catch (fetchError) {
      console.error('❌ Fetch error:', fetchError.toString());
      console.error('Error details:', fetchError.stack);
    }
    
  } catch (error) {
    console.error('❌ Critical error in bank transfer onFormSubmit:', error.toString());
    console.error('Error stack:', error.stack);
    
    // Send error email to admin
    try {
      MailApp.sendEmail({
        to: 'shashistudy2125@gmail.com',
        subject: 'Bank Transfer Form Critical Error',
        body: `Critical error in bank transfer form processing:\n\n${error.toString()}\n\nStack:\n${error.stack}\n\nTime: ${new Date()}\n\nEvent: ${JSON.stringify(e, null, 2)}`
      });
      console.log('📧 Error email sent to admin');
    } catch (emailError) {
      console.error('Failed to send error email:', emailError.toString());
    }
  }
}

/**
 * CORRECT way to set up the form trigger for bank transfer form
 */
function setupFormTrigger() {
  try {
    console.log('🔧 Setting up bank transfer form submit trigger...');
    
    // Delete existing triggers first
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'onFormSubmit') {
        ScriptApp.deleteTrigger(trigger);
        console.log('🗑️ Deleted existing trigger');
      }
    });
    
    // Get the bank transfer form by ID
    const formId = '1EmDm2ZdAuHpEzQ7IMe8q4Waw_v0d61Lx_lDCMLCXdoU';
    const form = FormApp.openById(formId);
    
    console.log('📋 Bank transfer form found:', form.getTitle());
    
    // Create the form submit trigger using the form object
    const trigger = form.createSubmitTrigger();
    
    console.log('✅ Bank transfer form submit trigger created successfully!');
    console.log('🎯 Trigger ID:', trigger.getUniqueId());
    
    return trigger;
    
  } catch (error) {
    console.error('❌ Error setting up bank transfer form trigger:', error.toString());
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
 * Test the webhook connection for bank transfers
 */
function testWebhook() {
  try {
    console.log('🧪 Testing bank transfer webhook connection...');
    
    const testData = {
      orderId: 'TEST_TRANSFER_' + Date.now(),
      checkNumber: '', // Not applicable for transfers
      bankName: 'Test Bank',
      utrNumber: 'TEST123456789',
      userEmail: 'test@example.com',
      userName: 'Test User',
      amount: '599',
      source: 'manual_test_transfer',
      paymentType: 'transfer',
      message: 'Test from bank transfer Google Apps Script'
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
      console.log('✅ Bank transfer webhook test successful!');
    } else {
      console.log('⚠️ Bank transfer webhook test failed with status:', responseCode);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.toString());
  }
}

/**
 * Debug function to check bank transfer form structure
 */
function debugFormStructure() {
  try {
    console.log('🔍 Debugging bank transfer form structure...');
    
    const formId = '1EmDm2ZdAuHpEzQ7IMe8q4Waw_v0d61Lx_lDCMLCXdoU';
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