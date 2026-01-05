// Test Helper - Paste this in ChatGPT console to help extension find the right elements

// Test if content script is loaded
console.log("Testing ChatGPT Extension...");

// Find input field
function findInputField() {
  const textarea = document.querySelector('textarea');
  const contenteditable = document.querySelector('[contenteditable="true"]');
  
  console.log("Textarea found:", !!textarea);
  console.log("Contenteditable found:", !!contenteditable);
  
  return textarea || contenteditable;
}

// Find send button
function findSendButton() {
  const buttons = Array.from(document.querySelectorAll('button'));
  const sendBtn = buttons.find(btn => {
    const ariaLabel = btn.getAttribute('aria-label');
    return ariaLabel && (
      ariaLabel.toLowerCase().includes('send') ||
      ariaLabel.toLowerCase().includes('gửi')
    );
  });
  
  console.log("Send button found:", !!sendBtn);
  return sendBtn;
}

// Find last assistant message
function findLastMessage() {
  const messages = document.querySelectorAll('[data-message-author-role]');
  console.log("Total messages found:", messages.length);
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const role = msg.getAttribute('data-message-author-role');
    if (role === 'assistant') {
      console.log("Last assistant message:", msg.textContent.substring(0, 100) + "...");
      return msg;
    }
  }
  
  return null;
}

// Run tests
console.log("=== ChatGPT Extension Test ===");
const inputField = findInputField();
const sendButton = findSendButton();
const lastMessage = findLastMessage();

console.log("\nResults:");
console.log("✓ Input field found:", !!inputField);
console.log("✓ Send button found:", !!sendButton);
console.log("✓ Messages found:", !!lastMessage);
console.log("\n✓ Extension should work if all above are TRUE");
