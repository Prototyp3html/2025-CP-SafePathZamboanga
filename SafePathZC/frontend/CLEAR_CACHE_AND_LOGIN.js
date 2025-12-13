// Run this in the browser console (F12 → Console) to fix the authentication issue:

// Clear old/corrupted tokens
localStorage.removeItem("admin_token");
localStorage.removeItem("admin_data");
localStorage.removeItem("user_token");
localStorage.removeItem("user_data");

console.log("✓ Cleared all cached tokens and user data");
console.log("Now please refresh the page (Ctrl+F5) and login again.");

// Verify they're cleared
console.log("\n=== After clearing ===");
console.log("admin_token:", localStorage.getItem("admin_token"));
console.log("admin_data:", localStorage.getItem("admin_data"));
