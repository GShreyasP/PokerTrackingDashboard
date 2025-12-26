# Poker Money Tracker

A web application for tracking poker money and chips during a game session.

## How to Use

1. **Open the website**: Simply open `index.html` in your web browser (double-click the file or right-click and select "Open with" your preferred browser).

2. **Initial Setup**:
   - Enter the number of people playing
   - For each person, enter their name and initial money amount
   - Enter the total number of chips given out
   - Enter how many chips make up one stack
   - Toggle whether all chips are worth the same value
     - If **same value**: The chip value will be calculated as (Total Money / Total Chips)
     - If **different values**: Enter the dollar value for each chip color (black, white, green, red, blue)

3. **Start Tracking**: Click "Start Tracking" to begin

4. **Managing Money**:
   - Each person has a widget showing their current balance
   - Click **"+ Add Money"** to add more stacks/money to a person
   - Click **"- Remove Money"** when a person repays the bank

5. **View Totals**:
   - The **Total Pot** shows the sum of all money currently in play
   - The **Transaction Log** shows all transactions with timestamps

## Example

If 4 people each put in $10, and 80 total chips were given out (20 chips per person), and each chip is worth the same:
- Total Money: $40
- Total Chips: 80
- Chip Value: $40 / 80 = $0.50 per chip

## Features

- ✅ Track multiple people and their money
- ✅ Support for same-value or different-value chips
- ✅ Add/remove money during the game
- ✅ Real-time total pot calculation
- ✅ Transaction log with timestamps
- ✅ Modern, responsive UI

## Files

- `index.html` - Main HTML structure
- `style.css` - Styling and layout
- `script.js` - Application logic

