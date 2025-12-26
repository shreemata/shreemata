# Retroactive Cashback Script

This script adds cashback to users' wallets for orders that were completed before the cashback system was properly implemented.

## Usage

1. **Make sure your server is stopped** (to avoid conflicts)

2. **Run the script:**
   ```bash
   node scripts/addRetroactiveCashback.js
   ```

3. **Check the output** to see how much cashback was added

## What it does

- Finds all completed orders
- Checks each order item for cashback settings
- Calculates cashback based on book/bundle settings
- Adds cashback to user's wallet balance
- Shows detailed logs of the process

## Safety

- Only processes completed orders
- Only adds cashback for books/bundles that have cashback configured
- Shows detailed logs so you can verify the amounts
- Safe to run multiple times (but will add cashback multiple times if run repeatedly)

## Example Output

```
🔍 Processing order 694e9c755461e49cc290416e (Dec 23, 2024)
  📚 Book "cash back book": ₹2.00 cashback
  ✅ Added ₹2.00 to Nataraj's wallet
  💰 Wallet: ₹0.00 → ₹2.00

🎉 Retroactive cashback processing completed!
📊 Summary:
   Orders processed: 1
   Total cashback added: ₹2.00
```