# Poker Money Tracker

A web application for tracking poker money and chips during a game session. Track balances, manage chips, and monitor transactions in real-time.

## 🚀 Live Demo

Deployed on Vercel: [View Live Site](https://poker-tracking-dashboard.vercel.app)

## 📋 How to Use

1. **Initial Setup**:
   - Enter the number of people playing
   - Enter how much 1 stack is worth ($)
   - Enter how many chips are in one stack
   - Toggle whether all chips are worth the same value
     - If **same value**: Chip value is calculated automatically (stack value / chips per stack)
     - If **different values**: Enter the dollar value for each chip color (black, white, green, red, blue)

2. **Start Tracking**: Click "Start Tracking" to go to the dashboard

3. **Dashboard Features**:
   - Each person starts with 1 stack automatically
   - Edit names and money directly in the widgets
   - **Balance Display**: 
     - Red (negative) = They put in more money than they got back
     - Green (positive) = They got back more than they put in (profit!)
   - Click **"+ Add"** to add more stacks/money
   - Click **"- Subtract"** to return chips (enter number of chips to return)
   - View personal transaction logs by clicking "View Personal Log" under each widget

4. **Tracking**:
   - **Total Pot**: Shows net money in pot (money put in - money returned)
   - **Total Chips in Play**: Tracks all chips to verify counts
   - **Transaction Log**: Complete history of all transactions
   - **Personal Logs**: Individual transaction history for each person

## 💡 Features

- ✅ Track multiple people and their balances
- ✅ Support for same-value or different-value chips
- ✅ Partial stack additions (e.g., 0.5 stacks)
- ✅ Return chips (even more than you have - from other players)
- ✅ Real-time balance calculation (red for negative, green for profit)
- ✅ Total pot tracking (accounts for money returned)
- ✅ Total chips tracker for verification
- ✅ Transaction log with timestamps
- ✅ Personal transaction logs for each player
- ✅ Data persistence with localStorage
- ✅ Modern, responsive UI
- ✅ Deployed and ready to use

## 🛠️ Development

### Local Development

```bash
# Clone the repository
git clone https://github.com/GShreyasP/PokerTrackingDashboard.git

# Navigate to the directory
cd PokerTrackingDashboard

# Open index.html in your browser
# Or use a local server:
npx serve .
```

### Deploy to Vercel

1. Import the repository in Vercel
2. Vercel will automatically detect it as a static site
3. Deploy! No build step needed.

Or use Vercel CLI:
```bash
npm i -g vercel
vercel
```

## 📁 Project Structure

```
PokerTrackingDashboard/
├── index.html      # Main HTML structure
├── style.css       # Styling and layout
├── script.js       # Application logic
├── vercel.json     # Vercel deployment configuration
├── package.json    # Project metadata
└── README.md       # This file
```

## 🎮 Example Usage

**Setup:**
- 4 people playing
- 1 stack = $10
- 20 chips per stack
- All chips worth the same

**Result:**
- Each person starts with $10 and 20 chips
- Chip value = $10 / 20 = $0.50 per chip
- Total Pot = $40
- Total Chips = 80

**During Game:**
- Person A returns 30 chips → Gets $15 back → Balance becomes +$5.00 (green)
- Person B adds 0.5 stacks → Adds $5 and 10 chips → Balance becomes -$15.00 (red)
- Total Pot updates automatically

## 📝 License

MIT

## 👤 Author

GShreyasP

