// Inline test for success popup - paste this in browser console

function testPopupInline() {
    console.log("🧪 Creating inline test popup...");
    
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(255, 0, 0, 0.8) !important;
        z-index: 999999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 20px !important;
        visibility: visible !important;
        opacity: 1 !important;
    `;

    // Create success card
    const card = document.createElement('div');
    card.style.cssText = `
        background: white !important;
        border: 5px solid blue !important;
        border-radius: 20px !important;
        padding: 40px 30px !important;
        max-width: 500px !important;
        width: 100% !important;
        text-align: center !important;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5) !important;
        position: relative !important;
        z-index: 1000000 !important;
        visibility: visible !important;
        opacity: 1 !important;
        display: block !important;
        font-family: Arial, sans-serif !important;
    `;

    card.innerHTML = `
        <div style="width: 80px; height: 80px; border-radius: 50%; background: green; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: white; font-size: 40px; font-weight: bold;">✓</div>
        <h2 style="font-size: 28px; font-weight: 700; color: #28a745; margin: 0 0 10px 0;">🎉 Test Popup!</h2>
        <p style="font-size: 16px; color: #666; margin: 0 0 25px 0;">This is a test popup to check if popups are working.</p>
        <button onclick="this.parentElement.parentElement.remove()" style="padding: 12px 20px; background: #667eea; color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 600;">Close Test</button>
    `;

    modal.appendChild(card);
    document.body.appendChild(modal);
    
    console.log("✅ Test popup created and added to DOM");
    console.log("Modal element:", modal);
    
    // Auto-close after 5 seconds
    setTimeout(() => {
        if (modal.parentNode) {
            modal.remove();
            console.log("🗑️ Test popup auto-closed");
        }
    }, 5000);
}

// Run the test
testPopupInline();